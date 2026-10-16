"""Streaming answers, plain-English progress steps and voice transcription. Fake providers only."""

import struct
from types import SimpleNamespace as NS

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError, APIStatusError

from api.main import app

from .conftest import sign_in
from retainiq import config, steps, voice
from retainiq.agent import Agent
from retainiq.llm import LLM, USAGE_HOOK, LLMError


# ------------------------------------------------------------------ helpers
def chunk(content=None, tool_calls=None):
    return NS(choices=[NS(delta=NS(content=content, tool_calls=tool_calls))])


def tool_fragment(name=None, args=None, id_=None):
    return NS(index=0, id=id_, function=NS(name=name, arguments=args))


def status_error(code, message="error"):
    response = httpx.Response(code, request=httpx.Request("POST", "http://x/v1/chat/completions"))
    return APIStatusError(message, response=response, body=None)


def wav(seconds: float, rate: int = 16000) -> bytes:
    n = int(seconds * rate)
    data = b"\x00\x00" * n
    return (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
            + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(data)) + data)


def llm_with(create) -> LLM:
    llm = LLM()
    llm.limiter.rpm = 0
    llm.client = NS(chat=NS(completions=NS(create=create)))
    llm._available, llm._checked_at = True, float("inf")
    return llm


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr("retainiq.llm.time.sleep", lambda s: None)


# ------------------------------------------------------------------ plain-English steps
RESULTS = {
    "get_dashboard": ({}, {"revenue_at_risk_90": 27468, "high_risk": 73, "vip_high_risk": 2, "active_customers": 975,
                           "auc_full": 0.806, "top_complaints": {"product_quality": 60}}),
    "list_at_risk": ({"limit": 3, "tier": "VIP"}, [{"name": "James Patel", "churn_prob": 0.63, "value_at_risk": 467}]),
    "get_customer": ({"customer_id": "C0139"}, {"name": "James Patel", "churn_prob": 0.63, "tier": "VIP", "language": "en",
                                                 "drivers": ["recent complaints"], "revenue_180": 1477, "days_since_order": 34,
                                                 "recommended_action": {"label": "Personal call + issue resolved"}}),
    "plan_campaign": ({"budget": 500}, {"budget": 500, "spent": 498, "customers": 51, "revenue_saved": 2410, "roi": 1.03,
                                        "action_mix": {"20% off next order": 28}, "top_customers": [{"name": "James Patel"}]}),
    "draft_message": ({"customer_id": "C1045"}, {"name": "Mia Schneider", "language": "de", "offer": "Free shipping", "message": "Hallo Mia"}),
}


def test_every_tool_gets_a_plain_english_step():
    expected = {
        "get_dashboard": ("Checked your dashboard", "$27,468 at risk across 73 high-risk customers"),
        "list_at_risk": ("Looked up at-risk VIP customers", "1 found, led by James Patel (63%)"),
        "get_customer": ("Opened James Patel's profile", "63% churn risk · recommended: Personal call + issue resolved"),
        "plan_campaign": ("Planned a $500 campaign", "51 customers · $2,410 revenue saved · ROI 103%"),
        "draft_message": ("Drafted a message for Mia Schneider", "In German, offering Free shipping"),
    }
    for tool, (args, result) in RESULTS.items():
        done = steps.clean_details(steps.finish(tool, args, result))
        assert (done["label"], done["summary"]) == expected[tool]
        assert not done["failed"] and all(done["details"])
        assert tool not in str(done) and "{" not in str(done["details"])        # no raw names or JSON


def test_failed_step_explains_itself():
    done = steps.finish("get_customer", {"customer_id": "C9999"}, {"error": "ValueError: No active customer C9999"})
    assert done["failed"] and done["summary"] == "Couldn't find customer C9999"


# ------------------------------------------------------------------ streaming agent
class Recorder:
    def __init__(self):
        self.steps, self.text, self.resets = [], [], 0

    def kwargs(self):
        return dict(on_step=self.steps.append, on_delta=self.text.append, on_reset=self._reset)

    def _reset(self):
        self.resets += 1
        self.text.clear()


def test_preamble_before_a_tool_call_is_taken_back_out_of_the_answer(client, monkeypatch):
    def create(model, messages, stream=False, **kw):
        if messages[-1]["role"] == "user":
            return iter([chunk("Let me check "), chunk("your dashboard."),
                         chunk(tool_calls=[tool_fragment("get_dashboard", "{}", "c1")])])
        return iter([chunk("You have "), chunk("$27,468 at risk.")])
    engine = app_engine()
    monkeypatch.setattr(engine, "llm", llm_with(create))
    rec = Recorder()
    answer = Agent(engine).ask("How are we doing?", **rec.kwargs())
    assert answer == "You have $27,468 at risk." == "".join(rec.text)
    assert rec.resets == 1
    think = [s for s in rec.steps if s["id"] == "think" and s["status"] == "done"][-1]   # steps upsert by id: last wins
    assert think["details"] == ["Let me check your dashboard."]
    assert ("write", "cancelled") in [(s["id"], s["status"]) for s in rec.steps]
    assert [(s["id"], s["status"]) for s in rec.steps][-1] == ("write", "done")


def test_rate_limit_before_the_first_word_is_retried_without_duplicates():
    calls = []

    def create(model, messages, stream=False, **kw):
        calls.append(1)
        if len(calls) == 1:
            raise status_error(429)
        return iter([chunk("Hello "), chunk("there.")])
    out = []
    result = llm_with(create).chat_stream([{"role": "user", "content": "hi"}], out.append)
    assert result.content == "Hello there." and out == ["Hello ", "there."] and len(calls) == 2


def test_failure_after_text_has_streamed_is_not_retried():
    calls = []

    def broken():
        yield chunk("Half an ")
        raise APIConnectionError(request=httpx.Request("POST", "http://x"))

    def create(model, messages, stream=False, **kw):
        calls.append(1)
        return broken()
    out = []
    with pytest.raises(LLMError):
        llm_with(create).chat_stream([{"role": "user", "content": "hi"}], out.append)
    assert out == ["Half an "] and len(calls) == 1                   # nothing shown twice


def test_provider_without_streaming_falls_back_to_one_complete_answer():
    def create(model, messages, stream=False, **kw):
        if stream:
            raise status_error(400, "stream is not supported for this model")
        return NS(choices=[NS(message=NS(content="All at once.", tool_calls=None))])
    out = []
    result = llm_with(create).chat_stream([{"role": "user", "content": "hi"}], out.append)
    assert result.content == "All at once." and out == ["All at once."]


def test_streams_report_their_token_counts():
    seen = {}

    def create(model, messages, stream=False, **kw):
        seen.update(kw)
        def gen():
            yield chunk("Hello")
            yield NS(choices=[], usage=NS(prompt_tokens=120, completion_tokens=9))    # the final usage chunk
        return gen()
    billed = []
    token = USAGE_HOOK.set(billed.append)
    try:
        result = llm_with(create).chat_stream([{"role": "user", "content": "hi"}], lambda t: None)
    finally:
        USAGE_HOOK.reset(token)
    assert seen["stream_options"] == {"include_usage": True}
    assert (result.usage.prompt_tokens, result.usage.completion_tokens) == (120, 9)
    assert billed == [result]                                   # the usage hook sees the counts


def test_provider_that_rejects_stream_options_still_streams():
    calls = []

    def create(model, messages, stream=False, **kw):
        calls.append("stream_options" in kw)
        if "stream_options" in kw:
            raise status_error(400, "Unrecognized request argument supplied: stream_options")
        return iter([chunk("Still "), chunk("streaming.")])
    llm = llm_with(create)
    out = []
    result = llm.chat_stream([{"role": "user", "content": "hi"}], out.append)
    assert result.content == "Still streaming." and out == ["Still ", "streaming."] and result.usage is None
    llm.chat_stream([{"role": "user", "content": "again"}], lambda t: None)
    assert calls == [True, False, False]                       # asked once, then never again


# ------------------------------------------------------------------ voice
def test_recording_checks():
    assert abs(voice.wav_duration(wav(2.0)) - 2.0) < 0.01
    for data, status in [(b"", 422), (b"x" * (voice.MAX_BYTES + 1), 413), (b"not a wav file at all" * 3, 415),
                         (wav(0.1), 422)]:
        with pytest.raises(voice.VoiceError) as exc:
            voice.check_recording(data)
        assert exc.value.status == status
    with pytest.raises(voice.VoiceError) as exc:
        voice.check_recording(wav(62, rate=8000))                   # 62 s (small sample rate keeps it under 2 MB)
    assert exc.value.status == 413


def test_transcribe_sends_audio_to_the_audio_model(monkeypatch):
    seen = {}

    def create(model, messages, **kw):
        seen["model"], seen["parts"], seen["extra"] = model, messages[0]["content"], kw.get("extra_body")
        return NS(choices=[NS(message=NS(content=' "Which VIPs are at risk?" ', tool_calls=None))])
    llm = llm_with(create)
    llm.model_ids = [config.LLM_MODEL, "MiMo-V2.6-Flash"]
    monkeypatch.setattr(config, "LLM_TRANSCRIBE_MODEL", "MiMo-V2.6-Flash")
    monkeypatch.setattr(voice, "_accepted_shape", None)
    assert voice.transcribe(llm, wav(2.0)) == "Which VIPs are at risk?"
    assert seen["model"] == "MiMo-V2.6-Flash" and seen["extra"] == {"reasoning_effort": "none"}
    text, audio = seen["parts"]
    assert text["type"] == "text" and audio["type"] == "input_audio"
    assert audio["input_audio"]["data"].startswith("data:audio/wav;base64,UklGR")     # a data URI, not raw base64
    assert audio["input_audio"]["format"] == "wav"


def test_transcribe_falls_back_to_an_audio_shape_the_provider_accepts(monkeypatch):
    tried = []

    def create(model, messages, **kw):
        part = messages[0]["content"][1]
        tried.append(part["type"])
        if part["type"] != "file":
            raise LLMError("LLM request failed (400): json_parse_error: data did not match any variant of "
                           "untagged enum MessageContent", status=400)
        assert part["file"]["file_data"].startswith("data:audio/wav;base64,")
        return NS(choices=[NS(message=NS(content="Show churn by plan", tool_calls=None))])
    llm = llm_with(create)
    monkeypatch.setattr(config, "LLM_TRANSCRIBE_MODEL", "MiMo-V2.6-Flash")
    monkeypatch.setattr(voice, "_accepted_shape", None)
    assert voice.transcribe(llm, wav(2.0)) == "Show churn by plan"
    assert tried == ["input_audio", "file"]
    tried.clear()
    assert voice.transcribe(llm, wav(2.0)) == "Show churn by plan"
    assert tried == ["file"]                                          # remembered: one call from now on


def test_gateway_validation_errors_count_as_shape_rejections():
    zod = ("LLM request failed (400): {'success': False, 'error': {'issues': [{'code': 'invalid_union', "
           "'message': 'Invalid input'}], 'name': 'ZodError'}}")
    assert voice._schema_rejected(LLMError(zod, status=400))
    assert not voice._schema_rejected(LLMError("LLM request failed (400): context length exceeded", status=400))


def test_transcribe_gives_up_cleanly_when_no_shape_is_accepted(monkeypatch):
    calls = []

    def create(model, messages, **kw):
        calls.append(1)
        raise LLMError("LLM request failed (400): json_parse_error", status=400)
    monkeypatch.setattr(config, "LLM_TRANSCRIBE_MODEL", "MiMo-V2.6-Flash")
    monkeypatch.setattr(voice, "_accepted_shape", None)
    monkeypatch.setattr(voice, "_audio_rejected", False)
    llm = llm_with(create)
    assert voice.voice_available(llm)
    with pytest.raises(LLMError) as exc:
        voice.transcribe(llm, wav(2.0))
    assert "doesn't accept audio" in str(exc.value) and exc.value.fatal and len(calls) == len(voice.AUDIO_SHAPES)
    assert not voice.voice_available(llm)                             # mic switched off: no more wasted calls


def test_transcribe_does_not_retry_other_errors(monkeypatch):
    calls = []

    def create(model, messages, **kw):
        calls.append(1)
        raise LLMError("LLM request failed (500): boom", status=500)
    monkeypatch.setattr(config, "LLM_TRANSCRIBE_MODEL", "MiMo-V2.6-Flash")
    monkeypatch.setattr(voice, "_accepted_shape", None)
    with pytest.raises(LLMError, match="boom"):
        voice.transcribe(llm_with(create), wav(2.0))
    assert len(calls) == 1


def test_transcribe_rejects_silence_and_unavailable_models(monkeypatch):
    llm = llm_with(lambda model, messages, **kw: NS(choices=[NS(message=NS(content="", tool_calls=None))]))
    monkeypatch.setattr(config, "LLM_TRANSCRIBE_MODEL", "MiMo-V2.6-Flash")
    with pytest.raises(voice.VoiceError) as exc:
        voice.transcribe(llm, wav(2.0))
    assert exc.value.status == 422
    llm.model_ids = [config.LLM_MODEL]                                # provider does not offer the audio model
    with pytest.raises(LLMError):
        voice.transcribe(llm, wav(2.0))
    monkeypatch.setattr(config, "LLM_TRANSCRIBE_MODEL", "")           # the vllm profile: no audio model at all
    assert voice.voice_available(llm) is False


# ------------------------------------------------------------------ endpoints
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        sign_in(c)
        yield c


def app_engine():
    return app.state.retainiq.engine


def test_transcribe_endpoint(client, monkeypatch):
    engine = app_engine()
    fake = llm_with(lambda model, messages, **kw: NS(choices=[NS(message=NS(content="Plan a $500 campaign", tool_calls=None))]))
    fake.model_ids = []
    monkeypatch.setattr(engine, "llm", fake)
    monkeypatch.setattr(config, "LLM_TRANSCRIBE_MODEL", "MiMo-V2.6-Flash")
    headers = {"Content-Type": "audio/wav"}
    assert client.post("/api/agent/transcribe", content=wav(1.5), headers=headers).json() == {"text": "Plan a $500 campaign"}
    assert client.post("/api/agent/transcribe", content=b"nope" * 20, headers=headers).status_code == 415
    assert client.post("/api/agent/transcribe", content=wav(0.1), headers=headers).status_code == 422
    fake._available = False
    assert client.post("/api/agent/transcribe", content=wav(1.5), headers=headers).status_code == 503
    assert client.get("/api/health").json()["voice_available"] is False
