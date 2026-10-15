import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

// Must match the pre-paint script in index.html.
const STORAGE_KEY = "retainiq-theme";

const prefersLight = () => window.matchMedia?.("(prefers-color-scheme: light)");

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";                                  // storage blocked: follow the OS
  }
}

// "System" defaults to dark unless the OS explicitly asks for light: dark is RetainIQ's home look.
const resolve = (mode: ThemeMode): ResolvedTheme =>
  mode === "system" ? (prefersLight()?.matches ? "light" : "dark") : mode;

function applyTheme(theme: ResolvedTheme, animate: boolean) {
  const root = document.documentElement;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduced) {
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 200);
  }
  root.dataset.theme = theme;
}

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(readMode()));

  // The pre-paint script normally did this already; repeat it in case it couldn't run.
  useEffect(() => applyTheme(theme, false), []);    // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not persisted - the choice still applies for this visit */
    }
    const resolved = resolve(next);
    applyTheme(resolved, true);
    setTheme(resolved);
  }, []);

  // In system mode, follow OS changes live.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = prefersLight();
    if (!mq) return;
    const onChange = () => {
      const resolved = resolve("system");
      applyTheme(resolved, true);
      setTheme(resolved);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  return <ThemeContext.Provider value={{ mode, theme, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
