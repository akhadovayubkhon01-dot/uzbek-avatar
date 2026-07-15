# Asilbek — Uzbek History & Culture AI Avatar

An interactive web app featuring **Asilbek**, a bilingual (Uzbek / English) AI teacher focused on Uzbek history, culture, and traditions.

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
  components/   Avatar, Chat, Header, TopicPicker
  data/         Topics and demo lesson content
  lib/          AI chat, speech, system prompts
```

## License

Private — for personal / educational use.
