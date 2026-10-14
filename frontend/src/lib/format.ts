export const money = (x: number) =>
  (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const label = (s: string) => s.replace(/_/g, " ");

export const riskColour = (p: number) => (p >= 0.4 ? "#ef4444" : p >= 0.2 ? "#f59e0b" : "#10b981");

export const LANGUAGE: Record<string, string> = { en: "English", es: "Spanish", de: "German" };
