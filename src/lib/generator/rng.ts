/**
 * Deterministic seeded RNG (SplitMix64-style mixing over 32-bit lanes).
 * Same seed → same sequence, on every platform. Never use Math.random in
 * generators: replayability of a student's sandbox depends on this.
 */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === "number" ? seed >>> 0 : hashString(seed);
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("pick from empty array");
    return arr[this.int(0, arr.length - 1)];
  }

  /** Pick `n` distinct elements. */
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = [...arr];
    this.shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  digits(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += this.int(0, 9);
    return s;
  }

  /** Weighted choice: entries are [value, weight]. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [v, w] of entries) {
      if ((r -= w) < 0) return v;
    }
    return entries[entries.length - 1][0];
  }

  /** Independent sub-stream, so adding a generator step never shifts another's output. */
  fork(label: string): Rng {
    return new Rng(hashString(`${this.state}:${label}`));
  }
}

/** FNV-1a 32-bit. Stable, fast, good enough for seeding. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed for a student sandbox: derived only from the user id, so reset reproduces it. */
export function seedForUser(userId: string): number {
  return hashString(`automation-lab:sandbox:${userId}`);
}

export const SHARED_CORPUS_SEED = hashString("automation-lab:shared-corpus:v1");
