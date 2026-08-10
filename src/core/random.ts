/**
 * Seeded pseudo-random number generation.
 *
 * Scope §6 Layer 0 requires deterministic chart selection: "Charts are sampled by a published
 * rule over the regime tags, not hand-picked for being interesting. Hand-curation changes the
 * difficulty distribution non-randomly and invalidates every population statistic computed on
 * it."
 *
 * Phase 0 does not yet have regime tags, so the published rule is not yet the one §6 wants —
 * but the selection is at least seeded and the seed is stored on every chart, so the corpus is
 * reproducible from the first commit rather than being an unrepeatable accident.
 */

/** mulberry32. Small, fast, and good enough for sampling and mirror assignment. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a string, for deriving per-symbol seeds from a master seed. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Fisher-Yates, seeded. Returns a new array. */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
