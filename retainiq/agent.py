"""A small tool-calling loop: the LLM (on AMD) decides which tools to call,
we run them in Python, feed back the results, and repeat until it answers.

AMD Token Factory models support tool calling out of the box. Our own vLLM needs
`--enable-auto-tool-choice --tool-call-parser hermes` for Qwen models;
scripts/serve_amd.sh starts it that way.
"""

import json
from dataclasses import dataclass, field
from typing import Callable

from . import tools
from .engine import Engine
from .llm import OnWait
from .prompts import AGENT_SYSTEM

MAX_STEPS = 6


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
            on_wait: OnWait | None = None) -> str:
        """Answer one question. `on_wait(seconds, reason)` fires while pacing or retrying a rate limit."""
        self.history.append({"role": "user", "content": question})
        turn = Turn(question)
        self.turns.append(turn)
        for _ in range(MAX_STEPS):
            resp = self.engine.llm.chat(self.history, on_wait=on_wait, tools=tools.SCHEMAS,
                                        temperature=0.2, max_tokens=700)
            msg = resp.choices[0].message
            if not msg.tool_calls:
                self.history.append({"role": "assistant", "content": msg.content or ""})
                turn.answer = msg.content or ""
                return turn.answer

            self.history.append({"role": "assistant", "content": msg.content or "",
                                 "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
            for tc in msg.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    on_tool(name, args)
                    result = tools.REGISTRY[name](self.engine, **args)
                    turn.tools.append(ToolUse(name, args, result))
                except Exception as exc:              # bad tool name/args: let the model recover
                    result = {"error": f"{type(exc).__name__}: {exc}"}
                self.history.append({"role": "tool", "tool_call_id": tc.id,
                                     "content": json.dumps(result, default=str)})
        turn.answer = "I couldn't finish that in a few steps - try a more specific question or a /command."
        return turn.answer
