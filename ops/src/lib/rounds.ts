/**
 * Round-mine deployment, ABIs and the pure helpers the rounds scripts share (docs/13-ROUNDS.md).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { artifact } from "./artifacts.js";
import { chainId, DEPLOYMENTS } from "./season.js";

export interface RoundsDeployment {
  chainId: number;
  operator: Address;
  rig: Address;
  usdc: Address;
  oracle: Address;
  eligibility: Address;
  mine: Address;
  fragments: Address;
  vault: Address;
  stocks: Address[];
  symbols: string[];
  genesis: number;
  roundSeconds: number;
  claimSeconds: number;
  /** block the mine was deployed in (indexer start block) */
  block?: number;
  params?: Record<string, unknown>;
  paramsHash?: Hex;
}

export const ROUNDS_ENV = ["ROUNDS_MINE_ADDRESS", "ROUNDS_VAULT_ADDRESS", "ROUNDS_FRAGMENTS_ADDRESS", "STOCK_ADDRESSES", "STOCK_SYMBOLS", "USDC_ADDRESS", "GENESIS", "ROUND_SECONDS", "CLAIM_SECONDS"] as const;

/**
 * contracts/deployments/<chainId>-rounds.json (written by deploy-rounds), else the ROUNDS_* env values
 * (a host without the mount, e.g. the Railway keeper/watch services).
 */
export function loadRoundsDeployment(id = chainId()): RoundsDeployment {
  const p = join(DEPLOYMENTS, `${id}-rounds.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as RoundsDeployment;
  const mine = process.env.ROUNDS_MINE_ADDRESS as Address | undefined;
  if (!mine) throw new Error(`no rounds deployment for chain ${id} (${p}); run deploy-rounds first or set ROUNDS_MINE_ADDRESS`);
  const zero = "0x0000000000000000000000000000000000000000" as Address;
  const env = (k: string) => (process.env[k] as Address | undefined) ?? zero;
  const list = (k: string) => (process.env[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const stocks = list("STOCK_ADDRESSES") as Address[];
  const symbols = list("STOCK_SYMBOLS");
  return {
    chainId: id,
    operator: env("OPERATOR_ADDRESS"), rig: env("RIG_ADDRESS"), usdc: env("USDC_ADDRESS"), oracle: env("ORACLE_ADDRESS"),
    eligibility: env("ELIGIBILITY_ADDRESS"), mine, fragments: env("ROUNDS_FRAGMENTS_ADDRESS"), vault: env("ROUNDS_VAULT_ADDRESS"),
    stocks,
    symbols: symbols.length === stocks.length ? symbols : stocks.map((_, i) => `stock${i}`),
    genesis: Number(process.env.GENESIS ?? 0),
    roundSeconds: Number(process.env.ROUND_SECONDS ?? 3600),
    claimSeconds: Number(process.env.CLAIM_SECONDS ?? 900),
  };
}

export const roundMineAbi = artifact("RoundMine.sol", "RoundMine").abi;
export const roundVaultAbi = artifact("RoundVault.sol", "RoundVault").abi;

export interface RoundClock {
  /** round index at `now` (0 before genesis, like the contract) */
  round: number;
  roundStart: number;
  roundEnd: number;
  /** end of the previous round + claimSeconds: the previous round is claimable until then */
  claimOpenUntil: number;
  /** true while the previous round's claim window is open (never for round 0) */
  inClaimWindow: boolean;
  /** seconds until the current round closes (until genesis + roundSeconds before genesis) */
  secondsToClose: number;
}

/** Mirror of RoundMine.currentRound / roundEnd for a timestamp `now`; pure so the scripts can be tested. */
export function roundClock(genesis: number, roundSeconds: number, claimSeconds: number, now: number): RoundClock {
  const round = now < genesis ? 0 : Math.floor((now - genesis) / roundSeconds);
  const roundStart = genesis + round * roundSeconds;
  const roundEnd = roundStart + roundSeconds;
  const claimOpenUntil = roundStart + claimSeconds;
  return {
    round, roundStart, roundEnd, claimOpenUntil,
    inClaimWindow: round > 0 && now >= roundStart && now < claimOpenUntil,
    secondsToClose: roundEnd - now,
  };
}

export interface FundSchedule {
  perRound: bigint;
  /** what `fund` actually pulls: perRound × rounds (the remainder never leaves the funder) */
  total: bigint;
  remainder: bigint;
  firstRound: number;
  lastRound: number;
}

/**
 * Mirror of RoundMine.fund's arithmetic: `amount / rounds` per round, starting with the round after the
 * current one (round 0 before genesis).
 */
export function fundSchedule(amount: bigint, rounds: number, currentRound: number, beforeGenesis: boolean): FundSchedule {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 720) throw new Error(`rounds must be 1..720 (got ${rounds})`);
  const perRound = amount / BigInt(rounds);
  if (perRound === 0n) throw new Error("amount / rounds is zero: nothing would be scheduled");
  const total = perRound * BigInt(rounds);
  const firstRound = beforeGenesis ? 0 : currentRound + 1;
  return { perRound, total, remainder: amount - total, firstRound, lastRound: firstRound + rounds - 1 };
}

/** `--stock NVDA|0|all` → stock indices. */
export function resolveStocks(spec: string | undefined, symbols: string[]): number[] {
  if (!spec) throw new Error("--stock <symbol|index|all> is required");
  if (spec === "all") return symbols.map((_, i) => i);
  if (/^\d+$/.test(spec)) {
    const i = Number(spec);
    if (i >= symbols.length) throw new Error(`stock index ${i} out of range (0..${symbols.length - 1})`);
    return [i];
  }
  const i = symbols.findIndex((s) => s.toLowerCase() === spec.toLowerCase());
  if (i < 0) throw new Error(`unknown stock ${spec}; symbols are ${symbols.join(", ")}`);
  return [i];
}

/**
 * Given the scheduled amounts for rounds current+1 .. current+n, the number of rounds until the first
 * empty one (1 = next round is empty), or null when every one is funded.
 */
export function scheduleRunsOutIn(ahead: readonly bigint[]): number | null {
  const i = ahead.findIndex((a) => a === 0n);
  return i < 0 ? null : i + 1;
}
