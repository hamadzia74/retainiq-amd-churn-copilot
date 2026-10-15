import { useMemo } from "react";
import { useTheme } from "./ThemeProvider";

export interface ChartTheme {
  axis: string;
  label: string;
  line: string;
  reference: string;
  cursor: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  up: string;      // pushes toward churn
  down: string;    // pushes away from churn
  accent: string;
}

const read = (style: CSSStyleDeclaration, name: string) => style.getPropertyValue(name).trim();

/** Recharts takes colours as props, not classes - so read the current theme's tokens. */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      axis: read(s, "--muted"),
      label: read(s, "--soft"),
      line: read(s, "--line"),
      reference: read(s, "--subtle"),
      cursor: read(s, "--hover"),
      tooltipBg: read(s, "--panel"),
      tooltipBorder: read(s, "--line"),
      tooltipText: read(s, "--fg"),
      up: read(s, "--risk-high"),
      down: read(s, "--risk-low"),
      accent: read(s, "--amd"),
    };
  }, [theme]);
}
