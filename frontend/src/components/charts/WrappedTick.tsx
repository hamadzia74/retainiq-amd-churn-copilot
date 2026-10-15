import { wrapLabel } from "./layout";

const LINE_HEIGHT = 13;

/** Category-axis tick that wraps long labels onto several lines instead of cutting them off. */
export function WrappedTick({ x = 0, y = 0, payload, width, fill, fontSize = 11 }: {
  x?: number; y?: number; payload?: { value: string }; width: number; fill: string; fontSize?: number;
}) {
  const lines = wrapLabel(String(payload?.value ?? ""), width / (fontSize * 0.6));
  const firstDy = -((lines.length - 1) * LINE_HEIGHT) / 2 + fontSize * 0.35;
  return (
    <text x={x} y={y} textAnchor="end" fill={fill} fontSize={fontSize}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? firstDy : LINE_HEIGHT}>{line}</tspan>
      ))}
    </text>
  );
}
