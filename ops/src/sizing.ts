/**
 * Difficulty sizing (docs/04-TOKENOMICS.md §5.2).
 * D_total = expectedTotalHash × plannedSeconds; per-block by diffShareBps. The cap (maxDurationSeconds)
 * is an explicit choice, default 2× the planned pace and never under one hour: a season ends at block 4
 * or at the cap, whichever comes first.
 * All quantities are bigint in the contract's units (hash is 1e18-scaled).
 */
export interface SizingInput {
  expectedTotalHash: bigint; // 1e18-scaled hash units
  plannedSeconds: bigint;
  diffShareBps: readonly number[]; // must sum to 10_000, length == blocks
  shiftsPerBlock: number;
  capSeconds?: bigint; // maxDurationSeconds; default 2 × plannedSeconds
}

export interface Sizing {
  difficultyTotal: bigint;
  difficulty: bigint[];
  maxDurationSeconds: bigint;
}

const ONE_HOUR = 3600n;

/**
 * Pool sizing by value (docs/04 §5.1): split `poolUsd` by `valueShareBps` and convert each block's
 * share to whole-token units (1e18) at the given USD price. Prices in USD per token (floats are fine
 * here; the result is rounded to 1e-6 token).
 */
export function sizePoolByValue(poolUsd: number, valueShareBps: readonly number[], pricesUsd: readonly number[]): bigint[] {
  const sum = valueShareBps.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) throw new Error(`valueShareBps must sum to 10000, got ${sum}`);
  if (valueShareBps.length !== pricesUsd.length) throw new Error("one price per block");
  return valueShareBps.map((bps, i) => {
    if (!(pricesUsd[i] > 0)) throw new Error(`price for block ${i} must be positive`);
    const tokens = (poolUsd * bps) / 10_000 / pricesUsd[i];
    return BigInt(Math.round(tokens * 1e6)) * 10n ** 12n;
  });
}

export function sizeDifficulty(input: SizingInput): Sizing {
  const sum = input.diffShareBps.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) throw new Error(`diffShareBps must sum to 10000, got ${sum}`);
  if (input.diffShareBps.length !== 4) throw new Error("v1 seasons have exactly 4 blocks");
  const total = input.expectedTotalHash * input.plannedSeconds;
  const spb = BigInt(input.shiftsPerBlock);
  // Round each block down to a multiple of shiftsPerBlock so shift difficulty is exact.
  const difficulty = input.diffShareBps.map((bps) => {
    const raw = (total * BigInt(bps)) / 10_000n;
    return raw - (raw % spb);
  });
  const difficultyTotal = difficulty.reduce((a, b) => a + b, 0n);
  const cap = input.capSeconds ?? 2n * input.plannedSeconds;
  return {
    difficultyTotal,
    difficulty,
    maxDurationSeconds: cap > ONE_HOUR ? cap : ONE_HOUR,
  };
}
