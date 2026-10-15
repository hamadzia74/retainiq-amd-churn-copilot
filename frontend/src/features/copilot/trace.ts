// Pure logic behind the collapsible progress trace (tested in trace.test.ts).
import type { AgentStep } from "../../api/types";

/** Open while the answer is being worked on; collapsed after. A user's own toggle always wins. */
export function traceOpen(running: boolean, userChoice: boolean | null): boolean {
  return userChoice ?? running;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** The accordion header text. */
export function traceHeader(steps: AgentStep[], running: boolean, durationMs?: number): string {
  const shown = steps.filter((s) => s.status !== "cancelled");
  if (running) {
    const current = shown.findIndex((s) => s.status === "running");
    const n = current >= 0 ? current + 1 : shown.length;
    return `Working on it · step ${Math.max(n, 1)}`;
  }
  const failed = shown.filter((s) => s.status === "failed").length;
  const parts = [`How I got this`, `${shown.length} step${shown.length === 1 ? "" : "s"}`];
  if (failed) parts.push(`${failed} didn't work`);
  if (durationMs != null) parts.push(seconds(durationMs));
  return parts.join(" · ");
}

export const stepTime = (ms?: number) => (ms == null ? "" : ms < 1000 ? `${ms}ms` : seconds(ms));

/** While text streams in, close an unfinished **bold** or `code` span so raw markers never flash on screen. */
export function balanceMarkdown(text: string): string {
  let out = text;
  if ((out.match(/\*\*/g) ?? []).length % 2) out += "**";
  if ((out.replace(/```/g, "").match(/`/g) ?? []).length % 2) out += "`";
  return out;
}
