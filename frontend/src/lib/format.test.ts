import { describe, expect, it } from "vitest";
import { ago, generatePassword } from "./format";

describe("ago", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  const before = (s: number) => new Date(now - s * 1000).toISOString();

  it("says how long ago, in words", () => {
    expect(ago(null, now)).toBe("never");
    expect(ago(before(20), now)).toBe("just now");
    expect(ago(before(5 * 60), now)).toBe("5 min ago");
    expect(ago(before(3 * 3600), now)).toBe("3 h ago");
    expect(ago(before(86400 + 60), now)).toBe("1 day ago");
    expect(ago(before(3 * 86400), now)).toBe("3 days ago");
    expect(ago(before(30 * 86400), now)).toMatch(/2026/);
  });

  it("never says 'in the future' for clock skew", () => {
    expect(ago(new Date(now + 30_000).toISOString(), now)).toBe("just now");
  });
});

describe("generatePassword", () => {
  it("makes readable passwords of the asked length", () => {
    const p = generatePassword(20);
    expect(p).toHaveLength(20);
    expect(p).not.toMatch(/[0O1lI]/);
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
