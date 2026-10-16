"""Voice input: transcribe a short recording with an audio-capable model on AMD Token Factory.

The browser records, converts to 16 kHz mono WAV and posts the bytes. We check them, send them
once to the transcription model (MiMo-V2.6-Flash by default) and return the text. Recordings
are never stored.
"""

import base64
import logging
import struct

from . import config
from .llm import LLM, LLMError
from .prompts import TRANSCRIBE_PROMPT

log = logging.getLogger(__name__)

MAX_BYTES = 2 * 1024 * 1024
MAX_SECONDS = 61.0          # 60 s plus a little slack for the encoder
MIN_SECONDS = 0.3


class VoiceError(Exception):
    """A problem with the recording itself (HTTP status + a message the user can act on)."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def voice_available(llm: LLM) -> bool:
    """True when a transcription model is configured, the provider offers it, and it hasn't
    rejected every audio shape (then the mic is switched off until the server restarts)."""
    model = config.LLM_TRANSCRIBE_MODEL
    return (bool(model) and not _audio_rejected and llm.available
            and (not llm.model_ids or model in llm.model_ids))


def wav_duration(data: bytes) -> float:
    """Seconds of audio in a PCM WAV file (raises ValueError if it isn't one)."""
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("not a WAV file")
    pos, byte_rate = 12, None
    while pos + 8 <= len(data):
        chunk, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        if chunk == b"fmt ":
            byte_rate = struct.unpack("<I", data[pos + 16:pos + 20])[0]
        elif chunk == b"data":
            if not byte_rate:
                raise ValueError("WAV data before format")
            return min(size, len(data) - pos - 8) / byte_rate
        pos += 8 + size + (size % 2)
    raise ValueError("WAV file has no audio data")


def check_recording(data: bytes) -> float:
    if not data:
        raise VoiceError(422, "No audio was received.")
    if len(data) > MAX_BYTES:
        raise VoiceError(413, "That recording is too large. Keep it under a minute.")
    try:
        seconds = wav_duration(data)
    except ValueError:
        raise VoiceError(415, "The recording must be a WAV file.") from None
    if seconds > MAX_SECONDS:
        raise VoiceError(413, "Recordings can be up to 60 seconds.")
    if seconds < MIN_SECONDS:
        raise VoiceError(422, "Didn't catch that. Try again.")
    return seconds


# Token Factory's gateway validates content parts as text | image_url | input_audio {data, format} | file
# (it rejects audio_url and input_audio without `format`). Raw base64 in input_audio passed the gateway but
# the model backend answered 400 json_parse_error ("untagged enum MessageContent"). So we try the shapes
# the gateway allows, in order, and remember the first one the provider accepts.
AUDIO_SHAPES = {
    "input_audio": lambda uri: {"type": "input_audio", "input_audio": {"data": uri, "format": "wav"}},
    "file": lambda uri: {"type": "file", "file": {"file_data": uri, "filename": "question.wav"}},
}
_accepted_shape: str | None = None
_audio_rejected = False       # every shape was refused (Token Factory, Oct 2026: the MiMo backend can't parse audio)

_SCHEMA_HINTS = ("json_parse", "did not match", "messagecontent", "unknown variant", "invalid type",
                 "missing field", "invalid_union", "invalid_type", "invalid_literal", "zoderror")


def _schema_rejected(exc: LLMError) -> bool:
    """A 400 about the request's shape (so another audio shape may work), not about the audio or model."""
    msg = str(exc).lower()
    return exc.status == 400 and any(k in msg for k in _SCHEMA_HINTS)


def transcribe(llm: LLM, data: bytes) -> str:
    global _accepted_shape, _audio_rejected
    check_recording(data)
    if not voice_available(llm):
        raise LLMError("Voice input isn't available right now (no audio-capable model on this provider).")
    uri = "data:audio/wav;base64," + base64.b64encode(data).decode("ascii")
    shapes = [_accepted_shape] if _accepted_shape else list(AUDIO_SHAPES)
    for i, name in enumerate(shapes):
        try:
            resp = llm.chat(
                [{"role": "user", "content": [
                    {"type": "text", "text": TRANSCRIBE_PROMPT},
                    AUDIO_SHAPES[name](uri),
                ]}],
                model=config.LLM_TRANSCRIBE_MODEL, temperature=0, max_tokens=300,
                extra_body={"reasoning_effort": "none"},      # MiMo thinks by default; transcription doesn't need it
            )
        except LLMError as exc:
            if _schema_rejected(exc):
                log.warning("transcribe: provider rejected the %r audio shape: %.600s", name, exc)
            if _schema_rejected(exc) and i + 1 < len(shapes):
                continue
            if _schema_rejected(exc):
                _audio_rejected = True
                raise LLMError("The AMD provider doesn't accept audio input right now, so voice is switched off. "
                               "Type your question instead.", fatal=True, status=400) from exc
            raise
        _accepted_shape = name
        break
    text = (resp.choices[0].message.content or "").strip().strip('"').strip()
    if not text or text.lower() in {"[silence]", "(silence)", "...", "[no speech]"}:
        raise VoiceError(422, "Didn't catch that. Try again.")
    return text
