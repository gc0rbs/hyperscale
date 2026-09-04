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
