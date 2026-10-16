export const money = (x: number) =>
  (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const label = (s: string) => s.replace(/_/g, " ");

export const LANGUAGE: Record<string, string> = { en: "English", es: "Spanish", de: "German" };

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. `now` is for tests. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} day${s < 2 * 86400 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A random password people can read aloud: no 0/O or 1/l/I. */
export function generatePassword(length = 14, random: (n: number) => number = (n) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % n;
}): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[random(chars.length)]).join("");
}
