"""A small tool-calling loop: the LLM (on AMD) decides which tools to call,
we run them in Python, feed back the results, and repeat until it answers.

With `on_delta`, answers stream word by word and the loop reports plain-English progress
steps through `on_step` (see steps.py). Without it (the terminal app), it answers in one go.

AMD Token Factory models support tool calling out of the box. Our own vLLM needs
`--enable-auto-tool-choice --tool-call-parser hermes` for Qwen models;
scripts/serve_amd.sh starts it that way.
"""

import json
import time
from dataclasses import dataclass, field
from typing import Callable

from . import steps, tools
from .engine import Engine
from .llm import OnDelta, OnWait
from .prompts import AGENT_SYSTEM

MAX_STEPS = 6
GAVE_UP = "I couldn't finish that in a few steps - try a more specific question or a /command."

OnStep = Callable[[dict], None]     # {"id", "status": running|done|failed|cancelled, "label", "summary", "details", "ms"}


@dataclass
class ToolUse:
    name: str
    args: dict
    result: object


@dataclass
class Turn:
    """One question and what the Copilot did with it (read by the suggestions endpoint)."""
    question: str
    answer: str | None = None            # None = the turn failed
    tools: list[ToolUse] = field(default_factory=list)


def _tool_call_dict(tc) -> dict:
    """OpenAI tool call (SDK object or plain dict) -> the dict shape the chat history expects."""
    if isinstance(tc, dict):
        return tc
    return {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}


def _ms(since: float) -> int:
    return round((time.perf_counter() - since) * 1000)


class Agent:
    def __init__(self, engine: Engine):
        self.engine = engine
        self.history: list[dict] = [{"role": "system", "content": AGENT_SYSTEM}]
        self.turns: list[Turn] = []

    @property
    def last_turn(self) -> Turn | None:
        return self.turns[-1] if self.turns else None

    @property
    def asked(self) -> list[str]:
        return [t.question for t in self.turns]

    def ask(self, question: str, on_tool: Callable[[str, dict], None] = lambda n, a: None,
            on_wait: OnWait | None = None, on_step: OnStep | None = None,
            on_delta: OnDelta | None = None, on_reset: Callable[[], None] | None = None) -> str:
        """Answer one question.

        on_wait(seconds, reason)  pacing or retrying a rate limit
        on_step(step)             plain-English progress (streaming mode)
        on_delta(text)            the next piece of the answer (streaming mode)
        on_reset()                discard text streamed so far: it was a preamble before a tool call
        """
        emit = on_step or (lambda s: None)
        self.history.append({"role": "user", "content": question})
        turn = Turn(question)
        self.turns.append(turn)

        think_started = time.perf_counter()
        think_ms: int | None = None
        emit({"id": "think", "status": "running", "label": "Understanding your question"})
        tool_no = 0

        def end_thinking(summary: str, details: list[str], update: bool = False):
            """Finish the "understanding" step - or, with `update`, re-send it with better info
            (steps are matched by id, so the client replaces the earlier version)."""
            nonlocal think_ms
            if think_ms is None:
                think_ms = _ms(think_started)
            elif not update:
                return
            emit({"id": "think", "status": "done", "label": "Understood your question",
                  "summary": summary, "details": details, "ms": think_ms})

        for _ in range(MAX_STEPS):
            writing_started: float | None = None

            def delta(text: str):
                nonlocal writing_started
                if writing_started is None:
                    writing_started = time.perf_counter()
                    end_thinking("Answering from what it already knows" if tool_no == 0 else "", [])
                    emit({"id": "write", "status": "running", "label": "Writing the answer"})
                on_delta(text)

            if on_delta:
                result = self.engine.llm.chat_stream(self.history, delta, on_wait=on_wait, tools=tools.SCHEMAS,
                                                     temperature=0.2, max_tokens=700)
                content, calls = result.content, result.tool_calls
            else:
                msg = self.engine.llm.chat(self.history, on_wait=on_wait, tools=tools.SCHEMAS,
                                           temperature=0.2, max_tokens=700).choices[0].message
                content, calls = msg.content or "", [_tool_call_dict(tc) for tc in (msg.tool_calls or [])]

            if not calls:
                end_thinking("Answering from what it already knows", [])
                if writing_started is not None:
                    emit({"id": "write", "status": "done", "label": "Wrote the answer", "ms": _ms(writing_started)})
                self.history.append({"role": "assistant", "content": content})
                turn.answer = content
                return content

            # The model is calling tools. Text streamed in this round was a preamble ("Let me check..."),
            # not the answer: take it back out and keep it as a detail of the "understanding" step.
            preamble = content.strip()
            if writing_started is not None:
                emit({"id": "write", "status": "cancelled", "label": "Writing the answer"})
                if on_reset:
                    on_reset()
            if tool_no == 0:                        # first tool round: this is what "understanding" decided
                end_thinking(f"Decided to look up {len(calls)} thing{'s' if len(calls) > 1 else ''}",
                             [preamble] if preamble else [], update=True)

            self.history.append({"role": "assistant", "content": content, "tool_calls": calls})
            for tc in calls:
                tool_no += 1
                step_id = f"tool-{tool_no}"
                name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                emit({"id": step_id, "status": "running", "label": steps.start_label(name, args)})
                started = time.perf_counter()
                try:
                    on_tool(name, args)
                    result = tools.REGISTRY[name](self.engine, **args)
                    turn.tools.append(ToolUse(name, args, result))
                except Exception as exc:              # bad tool name/args: let the model recover
                    result = {"error": f"{type(exc).__name__}: {exc}"}
                done = steps.clean_details(steps.finish(name, args, result))
                emit({"id": step_id, "status": "failed" if done["failed"] else "done", "label": done["label"],
                      "summary": done["summary"], "details": done["details"], "ms": _ms(started)})
                self.history.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(result, default=str)})

        turn.answer = GAVE_UP
        if on_delta:
            on_delta(GAVE_UP)
        return GAVE_UP
