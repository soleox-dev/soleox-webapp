/** SVG path helpers shared by the Owner Reports line charts (smooth monotone curves, filled areas, peaks). */

export function smoothRuns(points: Array<{ x: number; y: number }>, present: boolean[]): Array<Array<{ x: number; y: number }>> {
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  points.forEach((point, index) => {
    if (present[index]) run.push(point);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

export function areaUnder(points: Array<{ x: number; y: number }>, baseline: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${smoothLine(points)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export function linePeaks(points: Array<{ x: number; y: number }>, present: boolean[], values: number[]): Array<{ x: number; y: number }> {
  const peaks: Array<{ x: number; y: number }> = [];
  values.forEach((value, index) => {
    if (!present[index]) return;
    const left = index > 0 && present[index - 1] ? values[index - 1] : null;
    const right = index < values.length - 1 && present[index + 1] ? values[index + 1] : null;
    if (left === null && right === null) return;
    if (left !== null && value <= left) return;
    if (right !== null && value <= right) return;
    peaks.push(points[index]);
  });
  return peaks;
}

export function smoothLine(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const segments = points.length - 1;
  const secant = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const dx = next.x - point.x;
    return dx === 0 ? 0 : (next.y - point.y) / dx;
  });
  const slope = secant.map((value, index) => {
    if (index === 0) return value;
    const previous = secant[index - 1];
    if (previous === 0 || value === 0 || (previous > 0) !== (value > 0)) return 0;
    return (previous + value) / 2;
  });
  slope.push(secant[segments - 1]);
  secant.forEach((value, index) => {
    if (value === 0) {
      slope[index] = 0;
      slope[index + 1] = 0;
      return;
    }
    const alpha = slope[index] / value;
    const beta = slope[index + 1] / value;
    const size = alpha * alpha + beta * beta;
    if (size > 9) {
      const scale = 3 / Math.sqrt(size);
      slope[index] = scale * alpha * value;
      slope[index + 1] = scale * beta * value;
    }
  });
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < segments; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = (end.x - start.x) / 3;
    path += ` C ${start.x + dx} ${start.y + slope[index] * dx} ${end.x - dx} ${end.y - slope[index + 1] * dx} ${end.x} ${end.y}`;
  }
  return path;
}

export function svgUserX(svg: SVGSVGElement, clientX: number, clientY: number): number {
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    const rect = svg.getBoundingClientRect();
    const viewWidth = svg.viewBox.baseVal.width || rect.width;
    return ((clientX - rect.left) / rect.width) * viewWidth;
  }
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse()).x;
}
