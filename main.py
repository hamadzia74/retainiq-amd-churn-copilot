"""RetainIQ - terminal churn-prevention copilot, powered by AMD.

    python main.py                 # interactive
    python main.py --demo          # scripted walkthrough (good for the video)
    python main.py --regenerate    # rebuild the synthetic store data

Type /help inside for commands, or just ask a question.
"""

import argparse

from rich.progress import BarColumn, MofNCompleteColumn, Progress, TimeElapsedColumn

from retainiq import config, ui
from retainiq.agent import Agent
from retainiq.engine import Engine
from retainiq.llm import LLMError


def cmd_risk(engine: Engine, args: list[str]) -> None:
    limit = next((int(a) for a in args if a.isdigit()), 10)
    tier = next((a for a in args if a.isalpha()), None)
    by = "value_at_risk" if "$" in args else "churn_prob"
    ui.risk_table(engine.at_risk(limit, tier, by))


def cmd_customer(engine: Engine, args: list[str]) -> None:
    c = engine.customer(args[0]) if args else None
    ui.customer_view(c) if c else ui.error("Usage: /customer <id> (an active customer, e.g. from /risk)")


def cmd_plan(engine: Engine, args: list[str]) -> None:
    budget = float(args[0].lstrip("$")) if args else 1000.0
    ui.plan_view(engine.plan(budget))


def cmd_message(engine: Engine, args: list[str]) -> None:
    if not args:
        return ui.error("Usage: /message <id>")
    with ui.console.status("Writing message on AMD..."):
        m = engine.draft_message(args[0])
    ui.message_view(m) if m else ui.error(f"No active customer {args[0]}")


def cmd_enrich(engine: Engine, args: list[str]) -> None:
    if not engine.llm.available:
        return ui.error(f"LLM unavailable: {engine.llm.problem}. Check .env (see .env.example).")
    force = "all" in args
    plan = engine.enrich_plan(force)
    if not plan["pending"]:
        return ui.info("Every message has already been read by the LLM. Use /enrich all to re-read.")
    ui.enrich_plan(plan, config.LLM_PROVIDER_NAME)
    try:
        with Progress("[red]Reading tickets & reviews on AMD[/]", BarColumn(), MofNCompleteColumn(),
                      TimeElapsedColumn(), console=ui.console) as bar:
            task = bar.add_task("", total=plan["pending"])
            stats = engine.enrich(lambda n: bar.advance(task, n), force=force)
    except KeyboardInterrupt:
        return ui.info("Stopped. Progress is saved - run /enrich again to resume.")
    except LLMError as exc:
        return ui.error(f"{exc} Progress so far is saved.")
    ui.enrich_summary(stats)


COMMANDS = {
    "/dashboard": lambda e, a: ui.dashboard(e.dashboard()),
    "/risk": cmd_risk,
    "/customer": cmd_customer,
    "/plan": cmd_plan,
    "/message": cmd_message,
    "/enrich": cmd_enrich,
    "/model": lambda e, a: ui.model_explainer(e.model.weights()),
    "/help": lambda e, a: ui.help_screen(),
}


def run(engine: Engine, agent: Agent, line: str) -> None:
    if line.startswith("/"):
        cmd, *args = line.split()
        handler = COMMANDS.get(cmd.lower())
        return handler(engine, args) if handler else ui.error(f"Unknown command {cmd} - try /help")
    if not engine.llm.available:
        return ui.error("The agent needs the LLM endpoint. Slash commands still work - try /help")
    with ui.console.status("Thinking on AMD...") as status:
        def waiting(seconds: float, reason: str) -> None:
            status.update(f"Thinking on AMD... ({reason}, retrying in {seconds:.0f}s)")
        reply = agent.ask(line, on_tool=ui.tool_call, on_wait=waiting)
    ui.answer(reply)


def demo(engine: Engine, agent: Agent) -> None:
    top = engine.at_risk(1, by="value_at_risk").index[0]     # the most revenue at stake
    steps = ["/dashboard", "/risk 8 $", f"/customer {top}", "/plan 1000", f"/message {top}", "/model"]
    if engine.llm.available:
        steps.append("Which VIP customers are at risk, and what should I do about them?")
    for step in steps:
        ui.console.rule(f"[bold]› {step}")
        run(engine, agent, step)


def main() -> None:
    parser = argparse.ArgumentParser(description="RetainIQ - churn-prevention copilot on AMD")
    parser.add_argument("--demo", action="store_true", help="run a scripted walkthrough and exit")
    parser.add_argument("--regenerate", action="store_true", help="rebuild the synthetic data")
    opts = parser.parse_args()

    with ui.console.status("Loading store data and training churn model..."):
        engine = Engine(regenerate=opts.regenerate)
        _ = engine.llm.available
    agent = Agent(engine)
    ui.banner(config.LLM_PROVIDER_NAME, engine.llm.label, engine.llm_share, engine.llm.usage())

    if opts.demo:
        return demo(engine, agent)

    while True:
        try:
            line = ui.console.input("\n[bold red]you ›[/] ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if line.lower() in ("/exit", "exit", "quit"):
            break
        if line:
            try:
                run(engine, agent, line)
            except Exception as exc:
                ui.error(f"{type(exc).__name__}: {exc}")
    ui.info("Bye.")


if __name__ == "__main__":
    main()
