import { describe, expect, it } from "vitest";
import type { AgentStep } from "../../api/types";
import { upsertStep } from "./chatController";
import { balanceMarkdown, stepTime, traceHeader, traceOpen } from "./trace";

const step = (id: string, status: AgentStep["status"], label = id): AgentStep => ({ id, status, label });

describe("progress trace", () => {
  it("is open while working and collapsed after - unless the user chose", () => {
    expect(traceOpen(true, null)).toBe(true);
    expect(traceOpen(false, null)).toBe(false);
    expect(traceOpen(false, true)).toBe(true);     // the user re-opened it: stays open after the answer
    expect(traceOpen(true, false)).toBe(false);    // the user closed it mid-answer: stays closed
  });

  it("names the current step while working", () => {
    expect(traceHeader([step("think", "done"), step("tool-1", "running")], true)).toBe("Working on it · step 2");
    expect(traceHeader([step("think", "running")], true)).toBe("Working on it · step 1");
  });

  it("summarises the finished trace with step count and time", () => {
    const done = [step("think", "done"), step("tool-1", "done"), step("write", "done"), step("x", "cancelled")];
    expect(traceHeader(done, false, 4210)).toBe("How I got this · 3 steps · 4.2s");
    expect(traceHeader([step("tool-1", "failed")], false, 900)).toBe("How I got this · 1 step · 1 didn't work · 0.9s");
  });

  it("formats step times", () => {
    expect(stepTime(840)).toBe("840ms");
    expect(stepTime(1530)).toBe("1.5s");
    expect(stepTime(undefined)).toBe("");
  });

  it("upserts steps by id and drops cancelled ones", () => {
    let s: AgentStep[] = [];
    s = upsertStep(s, step("a", "running"));
    s = upsertStep(s, step("b", "running"));
    s = upsertStep(s, { id: "a", status: "done", label: "A done", summary: "ok" });
    s = upsertStep(s, step("b", "cancelled"));
    expect(s).toEqual([{ id: "a", status: "done", label: "A done", summary: "ok" }]);
  });

  it("closes unfinished bold and code while streaming, and leaves finished text alone", () => {
    expect(balanceMarkdown("- **James")).toBe("- **James**");
    expect(balanceMarkdown("Use `plan_")).toBe("Use `plan_`");
    expect(balanceMarkdown("**James Patel** is at risk")).toBe("**James Patel** is at risk");
  });
});
