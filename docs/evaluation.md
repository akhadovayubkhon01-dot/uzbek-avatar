# Retrieval evaluation

Asilbek answers questions from a curated knowledge base (`knowledge/`) using
retrieval-augmented generation (RAG): for each question, the server finds the
4 most relevant passages and gives them to the chat model. This page records
how the retrieval step was measured and what changed as a result.

All numbers come from the result files in [`server/eval/`](../server/eval/).
They can be reproduced with the commands at the end.

## What was measured

- **Question sets**, written by the developer:
  - [`rag-questions.json`](../server/eval/rag-questions.json): 40 questions (34 answerable, 6 unrelated), English and Uzbek. Used as the regression set.
  - [`rag-questions-hard.json`](../server/eval/rag-questions-hard.json): 55 harder questions: paraphrases, English questions whose answer exists only in Uzbek, spelling variants (Ulugʻbek / Ulug'bek, Navoiy / Navoi), near-duplicate distractors, multi-part questions, and questions the knowledge base cannot answer. It is a development set, not a held-out test set.
- **Relevance rule:** a retrieved passage counts as correct only if it comes from the expected file and contains the exact expected text.
- **Metrics:**
  - **Hit@k:** the share of questions with a correct passage among the top k results. Hit@4 is what the chat model actually receives.
  - **MRR:** mean reciprocal rank of the first correct passage. 1.0 means it was always first.
  - **Margin:** how much the best correct passage outscores the best wrong one.

## Results

### 1. Splitting documents by headings

The first version cut documents into fixed-size pieces. The new chunker keeps
each heading section as one piece and stores alias and source lists as
metadata instead of searchable text.

| Regression set (34 answerable) | Fixed-size pieces | Heading sections |
|---|---|---|
| Pieces in the index | 23 | 58 |
| Hit@1 | 88.2% | **97.1%** |
| Hit@3 / Hit@4 | 100% / 100% | 100% / 100% |
| MRR | 0.936 | **0.980** |
| Words sent to the model (top 4) | 604 | **317** |
| Mean margin | 0.040 | **0.081** |
| Wrong passage ranked first | 4 | 1 |

In every case where the old method missed at rank 1, a list of name variants or source links
outranked the real content. Storing those lists as metadata removed that
noise.

### 2. Structuring the Uzbek files

The two Uzbek files had no section headings, so each became one large mixed
piece. Adding headings (without changing any text) gave 78 pieces.

| Regression set | Before | After |
|---|---|---|
| MRR | 0.980 | 0.985 |
| Words sent to the model (top 4) | 317 | 186 |
| Mean margin | 0.081 | 0.092 |

One question improved from rank 3 to rank 1. Another dropped from rank 1 to
rank 2: a short Uzbek passage about palov now outranks the English passage
that actually answers the question.

### 3. Harder development set (78-piece index)

| Answerable single-answer questions (30) | All | English (17) | Uzbek (13) |
|---|---|---|---|
| Hit@1 | 93.3% | 88.2% | 100% |
| Hit@4 | 100% | 100% | 100% |
| MRR | 0.961 | 0.931 | 1.000 |

All 4 multi-part questions had every needed passage within the top 4.

Both rank-1 misses were English questions whose answer exists only in an
Uzbek file. In each, an English passage about the right person or place,
but without the asked detail, scored slightly higher.

## Key finding: similarity cannot detect missing answers

The hard set includes 16 on-topic questions that the knowledge base cannot
answer, for example "When did Alisher Navoi die?" (the files give only his
birth). For these, the top passage is usually the section about the right
person, which simply lacks the detail.

| Top similarity score | Min | Median | Max |
|---|---|---|---|
| Answerable questions (30, best correct passage) | 0.658 | 0.706 | 0.794 |
| On-topic but unanswerable (16) | 0.600 | 0.684 | 0.724 |
| Unrelated questions (5) | 0.519 | 0.556 | 0.596 |

- Unrelated questions separate completely from answerable ones.
- On-topic unanswerable questions overlap heavily: 13 of 16 score at or above
  the weakest answerable question.

So a similarity cutoff could filter unrelated questions, but it cannot tell
whether the requested fact is actually present. That has to be handled when
the answer is written. A follow-up experiment comparing two grounding prompts
is in progress (`server/eval/evaluate-grounding.js`); it has no complete
results yet.

## Limits

- The developer wrote all questions after reading the knowledge base, so the
  results are likely optimistic.
- The sets are small: one question changes Hit@1 by about 3 percentage points.
- The knowledge base is small (78 pieces), which makes high recall easier.
- One embedding model (`gemini-embedding-001`) was tested.

## Reproduce

Requires a Gemini API key in `.env`.

```bash
npm run index                                  # build the search index
npm run eval:rag -- --label my-run             # regression set
npm run eval:rag:hard -- --label my-run        # hard development set
npm run eval:rag:compare -- results-heading-aware.json results-my-run.json
```
