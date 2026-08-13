/**
 * mulberry32 — small, fast, seeded PRNG.
 *
 * The seed lives in game state rather than in a closure so that every shuffle is
 * reproducible from a stored game document, and so Convex mutations stay pure.
 */

export interface RngResult<T> {
  value: T;
  seed: number;
}

function next(seed: number): { random: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  const nextSeed = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { random: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: nextSeed };
}

/** Fisher-Yates using the seeded stream. Returns a new array; input untouched. */
export function shuffle<T>(items: readonly T[], seed: number): RngResult<T[]> {
  const out = items.slice();
  let cursor = seed;

  for (let i = out.length - 1; i > 0; i--) {
    const step = next(cursor);
    cursor = step.seed;
    const j = Math.floor(step.random * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  return { value: out, seed: cursor };
}

/** Derives a seed from a room code so the same room always deals the same way. */
export function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
