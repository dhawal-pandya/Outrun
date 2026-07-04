// Sparse infinite-lattice addressing. Cells are stored in plain Maps/Sets
// keyed by a single number: key = x * 2^26 + y. Unique for |x|,|y| < 2^25
// (±33.5M cells from the origin) and stays inside float64 integer precision.
// Number keys hash much faster than "x,y" strings.

export const SPAN = 1 << 26;
export const HALF = SPAN >> 1;

export function pack(x, y) {
  return x * SPAN + y;
}

export function unpackX(k) {
  return Math.round(k / SPAN);
}

export function unpackY(k) {
  return k - Math.round(k / SPAN) * SPAN;
}

export function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
