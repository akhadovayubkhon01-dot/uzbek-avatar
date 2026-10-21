# Uzbek TTS service (backup copy)

This is a version-controlled copy of `tts_service.py`, the FastAPI service that
gives the app its Uzbek voice. **It does not run from this folder.** It needs
the model files and helper code from the upstream repository.

The working copy lives next to the model, at:
`D:\Documents\AI\STT_TTS\STT-TTS-Uz-master\STT-TTS-Uz-master\tts_service.py`

If you edit the service, edit it there, then copy it here again and commit.

## What it does

Wraps an open-source Uzbek VITS model (ONNX) from
https://github.com/3936010/STT-TTS-Uz in a small web service:

- `GET /health` reports status and whether it runs on CPU or GPU
- `POST /tts` takes `{"text": "..."}` and returns `audio/wav`

The React app calls `http://127.0.0.1:8000/tts` for Uzbek speech
(see `src/lib/speech.js`) and falls back to the browser voice if the
service isn't running.

## Setup on a new machine

1. Clone https://github.com/3936010/STT-TTS-Uz and install its
   `requirements.txt`, plus `fastapi`, `uvicorn` and `scipy`.
2. Copy `tts_service.py` from this folder into that repo's root, next to
   `utils.py`, `commons.py` and the `text/` folder.
3. Make sure the model files are in `tts_onnx/`:
   `vits_uzbek_finetuned.onnx` (used) and `uz_tts_base.json` (config).
4. From that folder, run:
   `uvicorn tts_service:app --port 8000`
5. Wait for `Model loaded. Service ready.`

## Notes

- Runs on CPU here (CUDA isn't set up), so each reply takes a few seconds.
- The model has a single, female speaker (`n_speakers: 0` in its config).
  There is no way to choose a male voice from this model.
- `clean_text_for_tts` prepares text before synthesis. The model's
  vocabulary has no digits and little punctuation, and unknown characters
  crashed it with `KeyError`. Numbers 0–9999 are converted to spoken Uzbek,
  with ordinal endings for years ("1501-yil" -> "bir ming besh yuz birinchi yil").
- Tuned voice settings: `length_scale 1.3` (slower), `noise_scale_w 0.6`
  (smoother word endings), `noise_scale 0.667`.
