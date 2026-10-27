export type PackedTile = {
  width: number;
  height: number;
};

export type PackedRow = {
  height: number;
  fill: boolean;
  tiles: PackedTile[];
};

/** Row height that stays near the container width, without asking a phone for a huge row. */
export function idealRowHeight(width: number): number {
  return Math.round(Math.min(Math.max(width / 3.4, 176), width * 0.78));
}

/**
 * Group pictures into rows whose height is as close as possible to `ideal`.
 * Every tile keeps its own aspect ratio. A short last row stays at `ideal`
 * instead of stretching across the container.
 */
export function packRows(aspects: number[], width: number, gap: number, ideal: number): PackedRow[] {
  const rows: PackedRow[] = [];
  let start = 0;

  while (start < aspects.length) {
    let bestEnd = start;
    let bestDiff = Infinity;
    let sum = 0;

    for (let end = start; end < aspects.length; end++) {
      sum += aspects[end];
      const count = end - start + 1;
      const height = (width - gap * (count - 1)) / sum;
      const diff = Math.abs(height - ideal);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestEnd = end;
      }
      if (height <= ideal) break;
    }

    const slice = aspects.slice(start, bestEnd + 1);
    const count = slice.length;
    const sumA = slice.reduce((total, aspect) => total + aspect, 0);
    const gaps = gap * (count - 1);
    let height = (width - gaps) / sumA;
    const last = bestEnd === aspects.length - 1;
    const fill = !(last && height > ideal * 1.05);
    if (!fill) height = ideal;
    height = Math.max(1, Math.round(height));

    const tiles: PackedTile[] = [];
    let used = 0;
    for (let index = 0; index < count; index++) {
      const tileWidth =
        fill && index === count - 1
          ? Math.max(1, Math.round(width - gaps - used))
          : Math.max(1, Math.round(height * slice[index]));
      used += tileWidth;
      tiles.push({ width: tileWidth, height });
    }

    rows.push({ height, fill, tiles });
    start = bestEnd + 1;
  }

  return rows;
}
