// Series colours shared by the donut and its legend (a separate module, so the legend
// can use them without pulling the lazily-loaded chart code into the page bundle).
export const SERIES_COLOURS = ["#ed1c24", "#f59e0b", "#38bdf8", "#a78bfa"];

export const seriesColour = (i: number) => SERIES_COLOURS[i % SERIES_COLOURS.length];
