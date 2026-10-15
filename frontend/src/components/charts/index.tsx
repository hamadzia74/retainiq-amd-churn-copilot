// Charts are lazy-loaded: Recharts (the heaviest dependency) downloads only when a chart
// is actually on screen, and a skeleton of the same height holds the space meanwhile.
import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import { Skeleton } from "../ui";

export type { ChartDatum } from "./types";

/** Suspense boundary for one chart, with a same-height skeleton so the layout never jumps. */
export function ChartSlot({ height, children }: { height: number; children: ReactNode }) {
  return <Suspense fallback={<Skeleton style={{ height }} />}>{children}</Suspense>;
}

const ContributionChartImpl = lazy(() => import("./ContributionChart"));
const HBarChartImpl = lazy(() => import("./HBarChart"));
const DonutChartImpl = lazy(() => import("./DonutChart"));

export function ContributionChart(props: ComponentProps<typeof ContributionChartImpl>) {
  return <ChartSlot height={props.height ?? 300}><ContributionChartImpl {...props} /></ChartSlot>;
}

export function HBarChart(props: ComponentProps<typeof HBarChartImpl>) {
  return <ChartSlot height={props.height ?? 170}><HBarChartImpl {...props} /></ChartSlot>;
}

export function DonutChart(props: ComponentProps<typeof DonutChartImpl>) {
  return <ChartSlot height={props.height ?? 240}><DonutChartImpl {...props} /></ChartSlot>;
}
