import { describe, expect, it } from "vitest";
import { axisLabelWidth, barChartHeight, wrapLabel } from "./layout";

describe("chart layout", () => {
  it("wraps labels between words without losing text", () => {
    expect(wrapLabel("customer service", 10)).toEqual(["customer", "service"]);
    expect(wrapLabel("delivery", 10)).toEqual(["delivery"]);
    expect(wrapLabel("negative tone (180d)", 12).join(" ")).toBe("negative tone (180d)");
  });

  it("hard-splits a single word longer than a line", () => {
    const lines = wrapLabel("supercalifragilistic", 8);
    expect(lines.join("")).toBe("supercalifragilistic");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(8);
  });

  it("gives long labels more room on desktop, caps it on phones", () => {
    const labels = ["threatened to leave (90d)", "delivery"];
    expect(axisLabelWidth(labels, false)).toBeGreaterThan(axisLabelWidth(labels, true));
    expect(axisLabelWidth(labels, true)).toBeLessThanOrEqual(104);
    expect(axisLabelWidth(["a"], false)).toBeGreaterThanOrEqual(64);
  });

  it("grows the chart with the number of rows", () => {
    expect(barChartHeight(8, false)).toBeGreaterThan(barChartHeight(4, false));
    expect(barChartHeight(4, true)).toBeGreaterThan(barChartHeight(4, false));   // room for wrapped labels
    expect(barChartHeight(1, false)).toBeGreaterThanOrEqual(120);
  });
});
