// Deterministic PRNG. Every random decision in a game flows through one RNG
// instance seeded from the game seed, so a (seed, strategy) pair always
// reproduces the same game. State is a single uint32, cheap to snapshot
// before each ply so undo can rewind randomness too.

/** xmur3 string hash - turns an arbitrary seed string into a uint32. */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 */
export class RNG {
  constructor(seed) {
    this.s = seed >>> 0;
  }
  /** float in [0, 1) */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** integer in [0, n) */
  int(n) {
    return Math.floor(this.next() * n);
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  getState() {
    return this.s;
  }
  setState(s) {
    this.s = s >>> 0;
  }
}
