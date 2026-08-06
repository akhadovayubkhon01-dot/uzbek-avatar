# Asilbek — Uzbek History & Culture AI Avatar

An interactive web app featuring **Asilbek**, a bilingual (Uzbek / English) AI teacher focused on Uzbek history, culture, and traditions. He is rendered as an illustrated portrait that lip-syncs to the generated Uzbek speech.

## Features

- Animated teacher avatar with speaking / listening states
- Chat in **O'zbek** or **English** — replies match your language
- Six curated topic cards (Silk Road, Timurids, Navoi, cuisine, textiles, Bukhara & Khiva)
- **Demo mode** works without API keys (hand-written lesson content)
- **AI mode** with OpenAI (`gpt-4o-mini`) for open-ended questions
- Text-to-speech read-aloud (browser voices; optional KotibAI for Uzbek)
- Voice input via Web Speech API (Chrome / Edge recommended)

## Quick start

```bash
cd uzbek-avatar
npm install
npm run dev
```

Open http://localhost:5173

### Enable full AI

1. Copy `.env.example` to `.env` and set `VITE_OPENAI_API_KEY`, **or**
2. Click ⚙️ in the app and paste your key (stored in localStorage)

### Better Uzbek voice

Sign up at [KotibAI](https://developer.kotib.ai) and set `VITE_KOTIBAI_API_KEY` in `.env`.

## Roadmap

| Phase | Goal |
|-------|------|
| **Now** | 2D avatar, chat, demo + OpenAI, bilingual UI |
| **Next** | 3D VRM avatar with lip sync (Three.js / Khavee SDK) |
| **Later** | RAG knowledge base from verified Uzbek history sources |
| **Later** | Real-time voice conversation (OpenAI Realtime API) |

## Project structure

```
src/
  assets/       asilbek.jpg — the avatar artwork
  components/   Avatar, Chat, AvatarMenuBar
  data/         Topics and demo lesson content
  lib/          AI chat, speech, lip-sync, system prompts
```

## Avatar & lip-sync

Asilbek is a single illustrated portrait. The mouth is an SVG overlay drawn on
top of the artwork, positioned in the image's own pixel space so it stays
aligned at any size.

He is painted mid-smile with his upper teeth showing, so the overlay does not
try to replace his mouth. It is anchored just below the teeth and grows
downward, the way a real jaw moves, leaving the smile intact. The edge is
feathered so the shape sits in the painting rather than looking pasted on.

Lip-sync is driven by the audio itself, not by phonemes: `src/lib/lipsync.js`
runs the playing speech through a Web Audio `AnalyserNode` and reads the
spectrum each frame. Loudness sets how far the mouth opens and the spectral
centroid decides whether the shape is rounded ("o", "u") or wide ("i", "e").
Because it never looks at the text, it works for Uzbek as well as any other
language.

When nothing is being spoken the overlay is hidden entirely, so the untouched
painting shows through.

This only applies to Uzbek replies, which come from the local TTS service as
real audio. English uses the browser's speech synthesis, which exposes no audio
stream, so there is nothing to analyse there.

If you replace `src/assets/asilbek.jpg`, update the mouth coordinates at the top
of `src/components/Avatar.jsx` to match the new artwork.

## License

Private — for personal / educational use.
