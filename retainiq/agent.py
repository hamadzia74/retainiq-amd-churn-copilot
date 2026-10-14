"""A small tool-calling loop: the LLM (on AMD) decides which tools to call,
we run them in Python, feed back the results, and repeat until it answers.

AMD Token Factory models support tool calling out of the box. Our own vLLM needs
`--enable-auto-tool-choice --tool-call-parser hermes` for Qwen models;
scripts/serve_amd.sh starts it that way.
"""

import json
from typing import Callable

from . import tools
from .engine import Engine
from .llm import OnWait
from .prompts import AGENT_SYSTEM

MAX_STEPS = 6


class Agent:
    def __init__(self, engine: Engine):
        self.engine = engine
        self.history: list[dict] = [{"role": "system", "content": AGENT_SYSTEM}]

    def ask(self, question: str, on_tool: Callable[[str, dict], None] = lambda n, a: None,
            on_wait: OnWait | None = None) -> str:
        """Answer one question. `on_wait(seconds, reason)` fires while pacing or retrying a rate limit."""
        self.history.append({"role": "user", "content": question})
        for _ in range(MAX_STEPS):
            resp = self.engine.llm.chat(self.history, on_wait=on_wait, tools=tools.SCHEMAS,
                                        temperature=0.2, max_tokens=700)
            msg = resp.choices[0].message
            if not msg.tool_calls:
                self.history.append({"role": "assistant", "content": msg.content or ""})
                return msg.content or ""

            self.history.append({"role": "assistant", "content": msg.content or "",
                                 "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
            for tc in msg.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    on_tool(name, args)
                    result = tools.REGISTRY[name](self.engine, **args)
                except Exception as exc:              # bad tool name/args: let the model recover
                    result = {"error": f"{type(exc).__name__}: {exc}"}
                self.history.append({"role": "tool", "tool_call_id": tc.id,
                                     "content": json.dumps(result, default=str)})
        return "I couldn't finish that in a few steps - try a more specific question or a /command."
