
from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import onnxruntime
from scipy.io.wavfile import write
import io

import utils
import commons
from text import text_to_sequence

app = FastAPI()

# Allow your app (running on a different port) to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Load the model ONCE at startup (not per request) ---
print("Loading Uzbek TTS model...")
MODEL_PATH = "./tts_onnx/vits_uzbek_finetuned.onnx"
CONFIG_PATH = "./tts_onnx/uz_tts_base.json"

hps = utils.get_hparams_from_file(CONFIG_PATH)

available = onnxruntime.get_available_providers()
provider = "CUDAExecutionProvider" if "CUDAExecutionProvider" in available else "CPUExecutionProvider"
print(f"Using provider: {provider}")

ort_session = onnxruntime.InferenceSession(MODEL_PATH, providers=[provider])
print("Model loaded. Service ready.")


import re

_ONES = ["nol", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"]
_TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"]

# Ordinal forms of the final word (year pronunciation).
# Uzbek ordinal = word + "inchi", with a couple of spelling adjustments.
_ORDINAL = {
    "nol": "nolinchi", "bir": "birinchi", "ikki": "ikkinchi", "uch": "uchinchi",
    "to'rt": "to'rtinchi", "besh": "beshinchi", "olti": "oltinchi", "yetti": "yettinchi",
    "sakkiz": "sakkizinchi", "to'qqiz": "to'qqizinchi",
    "o'n": "o'ninchi", "yigirma": "yigirmanchi", "o'ttiz": "o'ttizinchi", "qirq": "qirqinchi",
    "ellik": "ellikinchi", "oltmish": "oltmishinchi", "yetmish": "yetmishinchi",
    "sakson": "saksoninchi", "to'qson": "to'qsoninchi",
    "yuz": "yuzinchi", "ming": "minginchi",
}


def _number_to_uzbek_words(n):
    # Handles 0..9999. Returns a list of words (so we can make the last one ordinal).
    if n == 0:
        return ["nol"]
    words = []
    thousands = n // 1000
    hundreds = (n % 1000) // 100
    tens = (n % 100) // 10
    ones = n % 10

    if thousands:
        if thousands > 1:
            words.append(_ONES[thousands])
        words.append("ming")
    if hundreds:
        if hundreds > 1:
            words.append(_ONES[hundreds])
        words.append("yuz")
    if tens:
        words.append(_TENS[tens])
    if ones:
        words.append(_ONES[ones])
    return words


def _make_ordinal(words):
    # Turn the last word into its ordinal form (for years).
    if not words:
        return words
    last = words[-1]
    words[-1] = _ORDINAL.get(last, last + "inchi")
    return words


def _convert_numbers(text):
    # Find a number optionally followed by "-yil" (ordinal) and convert.
    def replace(match):
        num = int(match.group(1))
        is_year = match.group(2) is not None
        if num > 9999:
            return " "  # out of range: drop rather than crash
        words = _number_to_uzbek_words(num)
        if is_year:
            words = _make_ordinal(words)
            return " ".join(words) + " yil"
        return " ".join(words)

    # matches "1501-yil", "1501 yil", or a bare "1501"
    return re.sub(r"(\d+)(\s*-?\s*yil)?", replace, text)


def clean_text_for_tts(text):
    # 1) Convert numbers to spoken Uzbek words (years become ordinals).
    text = _convert_numbers(text)
    # 2) Replace characters the model can't pronounce with spaces.
    for ch in ["-", "—", "–", "_", "*", "#", "(", ")", "[", "]", "\"", "'"]:
        text = text.replace(ch, " ")
    # 3) Collapse any double spaces this creates.
    text = " ".join(text.split())
    return text


def get_text(text, hps):
    text = clean_text_for_tts(text)
    text_norm = text_to_sequence(text, hps.data.text_cleaners)
    if hps.data.add_blank:
        text_norm = commons.intersperse(text_norm, 0)
    text_norm = np.array(text_norm, dtype=np.int64)
    return text_norm


class TTSRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok", "provider": provider}


@app.post("/tts")
def tts(req: TTSRequest):
    stn_tst = get_text(req.text, hps)
    x = np.expand_dims(stn_tst, axis=0)
    x_lengths = np.array([stn_tst.shape[0]], dtype=np.int64)
    ort_inputs = {
        "x": x,
        "x_lengths": x_lengths,
        "noise_scale": np.array([0.667], dtype=np.float32),
        "length_scale": np.array([1.3], dtype=np.float32),
        "noise_scale_w": np.array([0.6], dtype=np.float32),
    }
    audio = ort_session.run(None, ort_inputs)[0][0, 0]

    # Convert to WAV bytes in memory
    buffer = io.BytesIO()
    write(buffer, hps.data.sampling_rate, audio)
    buffer.seek(0)
    return Response(content=buffer.read(), media_type="audio/wav")