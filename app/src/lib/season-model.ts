/**
 * Shapes the multicall results into the objects the UI and the estimator use.
 */
import type { Address } from "viem";
import { WAD, type GlobalState, type RigState, type SeasonConfig } from "./mine-math";

export interface SeasonParamsView {
  openTime: bigint;
  maxDurationSeconds: bigint;
  shiftsPerBlock: number;
  blocks: number;
  difficulty: bigint[];
  poolTokens: bigint[];
  stocks: Address[];
  fragPerToken: bigint;
  minStakeWeight: bigint;
  activationFeeBps: number;
  earlyExitFeeBps: number;
  gpuMultBps: number[];
  gpuCostBps: number[];
  coolCostBps: number[];
  heatPerOc: number[];
  coolPerShift: number[];
  heatMax: number;
  ocCostBps: number;
  ocBoostBps: number;
  maxActiveOc: number;
  ocShiftSpan: number;
  lpWeightPerToken: bigint;
  treasury: Address;
}

export interface SeasonSnapshot {
  params: SeasonParamsView;
  config: SeasonConfig;
  global: GlobalState;
  phase: number;
  funded: boolean;
  fetchedAt: number; // ms
  chainTime: bigint; // seconds, block timestamp at fetch
  chainOffset: bigint; // chainTime - wall clock at fetch; estimates use wall clock + offset
}

export interface RigSnapshot {
  id: bigint;
  owner: Address;
  asset: number;
  amount: bigint;
  weight: bigint;
  gpuTier: number;
  coolingTier: number;
  claimedMask: number;
  state: RigState;
  pendingChain: bigint[]; // contract's pending() at fetch, whole fragments
  liveHash: bigint;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toParams(raw: any): SeasonParamsView {
  return {
    openTime: BigInt(raw.openTime),
    maxDurationSeconds: BigInt(raw.maxDurationSeconds),
    shiftsPerBlock: Number(raw.shiftsPerBlock),
    blocks: Number(raw.blocks),
    difficulty: (raw.difficulty as bigint[]).map(BigInt),
    poolTokens: (raw.poolTokens as bigint[]).map(BigInt),
    stocks: raw.stocks as Address[],
    fragPerToken: BigInt(raw.fragPerToken),
    minStakeWeight: BigInt(raw.minStakeWeight),
    activationFeeBps: Number(raw.activationFeeBps),
    earlyExitFeeBps: Number(raw.earlyExitFeeBps),
    gpuMultBps: (raw.gpuMultBps as number[]).map(Number),
    gpuCostBps: (raw.gpuCostBps as number[]).map(Number),
    coolCostBps: (raw.coolCostBps as number[]).map(Number),
    heatPerOc: (raw.heatPerOc as number[]).map(Number),
    coolPerShift: (raw.coolPerShift as number[]).map(Number),
    heatMax: Number(raw.heatMax),
    ocCostBps: Number(raw.ocCostBps),
    ocBoostBps: Number(raw.ocBoostBps),
    maxActiveOc: Number(raw.maxActiveOc),
    ocShiftSpan: Number(raw.ocShiftSpan),
    lpWeightPerToken: BigInt(raw.lpWeightPerToken),
    treasury: raw.treasury as Address,
  };
}

export function toConfig(p: SeasonParamsView, ratePerWork: bigint[]): SeasonConfig {
  return {
    openTime: p.openTime,
    maxDurationSeconds: p.maxDurationSeconds,
    shiftsPerBlock: p.shiftsPerBlock,
    blocks: p.blocks,
    difficulty: p.difficulty,
    ratePerWork,
    coolPerShift: p.coolPerShift,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRigState(raw: any): RigState {
  return {
    inactive: Boolean(raw.inactive),
    lastShift: Number(raw.lastShift),
    lastX: BigInt(raw.lastX),
    baseHash: BigInt(raw.baseHash),
    ocHash: BigInt(raw.ocHash),
    ocExpiryShift: Number(raw.ocExpiryShift),
    activeOc: Number(raw.activeOc),
    heat: Number(raw.heat),
    coolingTier: Number(raw.coolingTier),
    earned: (raw.earned as bigint[]).map(BigInt),
  };
}

export const fragPerTokenToTokens = (frags: bigint, fragPerToken: bigint) => Number(frags) / Number(fragPerToken);
export const wadToNumber = (x: bigint) => Number(x / (WAD / 1_000_000n)) / 1_000_000;
