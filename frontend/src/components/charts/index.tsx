// Charts are lazy-loaded: Recharts (the heaviest dependency) downloads only when a chart
// is actually on screen, and a skeleton of the same height holds the space meanwhile.
import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { Skeleton } from "../ui";
import { barChartHeight } from "./layout";

export type { ChartDatum } from "./types";
export { SERIES_COLOURS, seriesColour } from "./palette";

/** Suspense boundary for one chart, with a same-height skeleton so the layout never jumps. */
export function ChartSlot({ height, children }: { height: number; children: ReactNode }) {
  return <Suspense fallback={<Skeleton style={{ height }} />}>{children}</Suspense>;
}

const ContributionChartImpl = lazy(() => import("./ContributionChart"));
const HBarChartImpl = lazy(() => import("./HBarChart"));
const DonutChartImpl = lazy(() => import("./DonutChart"));

export function ContributionChart(props: ComponentProps<typeof ContributionChartImpl>) {
  const compact = useIsMobile();
  return <ChartSlot height={props.height ?? barChartHeight(props.data.length, compact)}><ContributionChartImpl {...props} /></ChartSlot>;
}

export function HBarChart(props: ComponentProps<typeof HBarChartImpl>) {
  const compact = useIsMobile();
  return <ChartSlot height={props.height ?? barChartHeight(props.data.length, compact)}><HBarChartImpl {...props} /></ChartSlot>;
}

export function DonutChart(props: ComponentProps<typeof DonutChartImpl>) {
  return <ChartSlot height={props.height ?? 200}><DonutChartImpl {...props} /></ChartSlot>;
}
