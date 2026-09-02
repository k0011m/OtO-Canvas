/**
 * Small deterministic pseudo-random number helpers used by the composition
 * engine. Keeping all randomness here makes a saved project reproducible.
 */

export type SeedPart = number | string;

const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

/** FNV-1a, returned as an unsigned 32-bit integer. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function normalizeSeed(seed: SeedPart): number {
  if (typeof seed === "string") {
    return hashString(seed);
  }

  if (!Number.isFinite(seed)) {
    return 0;
  }

  return Math.trunc(seed) >>> 0;
}

/**
 * Combines independent values into one seed. Delimiters are length-prefixed so
 * combinations such as ["ab", "c"] and ["a", "bc"] cannot collide trivially.
 */
export function mixSeed(...parts: readonly SeedPart[]): number {
  let mixed = 0x811c9dc5;

  for (const part of parts) {
    const text = String(part);
    mixed ^= text.length;
    mixed = Math.imul(mixed, 0x01000193);
    for (let index = 0; index < text.length; index += 1) {
      mixed ^= text.charCodeAt(index);
      mixed = Math.imul(mixed, 0x01000193);
    }
  }

  return mixed >>> 0;
}

export class SeededRandom {
  private state: number;

  public constructor(seed: SeedPart) {
    this.state = normalizeSeed(seed);
  }

  /** Mulberry32: fast, deterministic, and sufficient for musical variation. */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  }

  public integer(minInclusive: number, maxExclusive: number): number {
    const min = Math.ceil(minInclusive);
    const max = Math.floor(maxExclusive);

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      throw new RangeError("integer() requires a finite range where max > min");
    }

    return min + Math.floor(this.next() * (max - min));
  }

  public chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.next() < probability;
  }

  public pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError("pick() requires at least one value");
    }

    return values[this.integer(0, values.length)] as T;
  }

  public shuffle<T>(values: readonly T[]): T[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.integer(0, index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex] as T,
        shuffled[index] as T,
      ];
    }
    return shuffled;
  }

  /** Creates a stable sub-stream without consuming the current stream. */
  public fork(label: SeedPart): SeededRandom {
    return new SeededRandom(mixSeed(this.state, label));
  }
}

export function createPrng(seed: SeedPart): SeededRandom {
  return new SeededRandom(seed);
}

/** A stateless random value useful for decisions tied to one event. */
export function randomFrom(...parts: readonly SeedPart[]): number {
  return createPrng(mixSeed(...parts)).next();
}
