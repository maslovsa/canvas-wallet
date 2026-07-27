// Deterministic (seeded) PRNG shared by widgets that generate illustrative,
// client-only data (price-chart's placeholder fallback, history's fake
// activity rows) — same seed always produces the same-looking output,
// rather than jumping on every re-render. mulberry32 is a small, well-known
// PRNG; cryptographic strength is irrelevant here, none of this is a
// security control.
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash;
}

export function seededRandom(seed: string): () => number {
  return mulberry32(hashString(seed));
}
