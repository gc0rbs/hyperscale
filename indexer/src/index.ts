import { type Context, ponder } from "ponder:registry";
import {
  burn,
  claim,
  exit,
  overclock,
  redemption,
  rewardBlock,
  rig,
  season,
  shift,
  walletStats,
} from "ponder:schema";
import type { Address, Hex } from "viem";

const BPS = 10_000n;

/** Immutable season parameters, read once from `SeasonMine.params()` and cached per process. */
interface SeasonParams {
  openTime: bigint;
  blocks: number;
  shiftsPerBlock: number;
  gpuMultBps: readonly number[];
}
let paramsCache: SeasonParams | undefined;

async function getParams(context: Context): Promise<SeasonParams> {
  if (paramsCache) return paramsCache;
  const p = await context.client.readContract({
    abi: context.contracts.SeasonMine.abi,
    address: context.contracts.SeasonMine.address as Address,
    functionName: "params",
  });
  paramsCache = {
    openTime: p.openTime,
    blocks: p.blocks,
    shiftsPerBlock: p.shiftsPerBlock,
    gpuMultBps: p.gpuMultBps,
  };
  return paramsCache;
}

function mineId(context: Context): Hex {
  return (context.contracts.SeasonMine.address as Address).toLowerCase() as Hex;
}

function lower(a: Address): Hex {
  return a.toLowerCase() as Hex;
}

function baseHashOf(weight: bigint, gpuTier: number, p: SeasonParams): bigint {
  const mult = p.gpuMultBps[gpuTier];
  if (mult === undefined) throw new Error(`gpuMultBps has no tier ${gpuTier}`);
  return (weight * BigInt(mult)) / BPS;
}

/** The season row is created lazily on the first event (the contract does not exist at startBlock 0). */
async function ensureSeason(context: Context) {
  const id = mineId(context);
  const existing = await context.db.find(season, { id });
  if (existing) return existing;
  const p = await getParams(context);
  return context.db.insert(season).values({
    id,
    mine: id,
    openTime: p.openTime,
    blocks: p.blocks,
    shiftsPerBlock: p.shiftsPerBlock,
    shift: 0,
    closedByFailSafe: false,
  });
}

const emptyStats = (id: Hex) => ({
  id,
  rigs: 0,
  rigsActivated: 0,
  totalWeight: 0n,
  totalHash: 0n,
  totalBurned: 0n,
  claimed0: 0n,
  claimed1: 0n,
  claimed2: 0n,
  claimed3: 0n,
  totalClaimed: 0n,
});

async function addBurned(context: Context, owner: Hex, amount: bigint) {
  await context.db
    .insert(walletStats)
    .values({ ...emptyStats(owner), totalBurned: amount })
    .onConflictDoUpdate((row) => ({ totalBurned: row.totalBurned + amount }));
}

async function requireRig(context: Context, rigId: bigint) {
  const r = await context.db.find(rig, { id: rigId });
  if (!r) throw new Error(`rig ${rigId} not indexed before its event`);
  return r;
}

/** Marks a rig inactive and removes it from its owner's aggregates. Idempotent. */
async function deactivate(context: Context, rigId: bigint) {
  const r = await requireRig(context, rigId);
  if (!r.active) return r;
  await context.db.update(rig, { id: rigId }).set({ active: false, activeOc: 0 });
  await context.db.update(walletStats, { id: r.owner }).set((row) => ({
    rigs: row.rigs - 1,
    totalWeight: row.totalWeight - r.weight,
    totalHash: row.totalHash - r.baseHash,
  }));
  return r;
}

// ---------------------------------------------------------------------------------------------
// SeasonMine
// ---------------------------------------------------------------------------------------------

ponder.on("SeasonMine:RigActivated", async ({ event, context }) => {
  await ensureSeason(context);
  const p = await getParams(context);
  const owner = lower(event.args.owner);
  const baseHash = baseHashOf(event.args.weight, 0, p);

  await context.db.insert(rig).values({
    id: event.args.rigId,
    owner,
    asset: event.args.asset,
    amount: event.args.amount,
    weight: event.args.weight,
    gpuTier: 0,
    coolingTier: 0,
    baseHash,
    heat: 0,
    activeOc: 0,
    ocExpiryShift: 0,
    active: true,
    activationFee: event.args.fee,
    createdAt: event.block.timestamp,
  });

  await context.db
    .insert(walletStats)
    .values({
      ...emptyStats(owner),
      rigs: 1,
      rigsActivated: 1,
      totalWeight: event.args.weight,
      totalHash: baseHash,
    })
    .onConflictDoUpdate((row) => ({
      rigs: row.rigs + 1,
      rigsActivated: row.rigsActivated + 1,
      totalWeight: row.totalWeight + event.args.weight,
      totalHash: row.totalHash + baseHash,
    }));
});

ponder.on("SeasonMine:GpuUpgraded", async ({ event, context }) => {
  await ensureSeason(context);
  const p = await getParams(context);
  const r = await requireRig(context, event.args.rigId);
  const newBase = baseHashOf(r.weight, event.args.tier, p);
  const delta = newBase - r.baseHash;

  await context.db
    .update(rig, { id: r.id })
    .set({ gpuTier: event.args.tier, baseHash: newBase });
  await context.db.insert(burn).values({
    id: event.id,
    rigId: r.id,
    owner: r.owner,
    kind: "gpu",
    amount: event.args.burned,
    timestamp: event.block.timestamp,
  });
  await context.db.update(walletStats, { id: r.owner }).set((row) => ({
    totalBurned: row.totalBurned + event.args.burned,
    // Only active rigs count toward hash (upgrades on inactive rigs are impossible on-chain).
    totalHash: r.active ? row.totalHash + delta : row.totalHash,
  }));
});

ponder.on("SeasonMine:CoolingUpgraded", async ({ event, context }) => {
  await ensureSeason(context);
  const r = await requireRig(context, event.args.rigId);
  await context.db.update(rig, { id: r.id }).set({ coolingTier: event.args.tier });
  await context.db.insert(burn).values({
    id: event.id,
    rigId: r.id,
    owner: r.owner,
    kind: "cooling",
    amount: event.args.burned,
    timestamp: event.block.timestamp,
  });
  await addBurned(context, r.owner, event.args.burned);
});

ponder.on("SeasonMine:Overclocked", async ({ event, context }) => {
  await ensureSeason(context);
  const r = await requireRig(context, event.args.rigId);
  await context.db.update(rig, { id: r.id }).set({
    heat: event.args.heat,
    activeOc: event.args.activeOc,
    ocExpiryShift: event.args.expiryShift,
  });
  await context.db.insert(overclock).values({
    id: event.id,
    rigId: r.id,
    shift: event.args.shift,
    activeOc: event.args.activeOc,
    expiryShift: event.args.expiryShift,
    heat: event.args.heat,
    burned: event.args.burned,
    timestamp: event.block.timestamp,
  });
  await context.db.insert(burn).values({
    id: event.id,
    rigId: r.id,
    owner: r.owner,
    kind: "overclock",
    amount: event.args.burned,
    timestamp: event.block.timestamp,
  });
  await addBurned(context, r.owner, event.args.burned);
});

ponder.on("SeasonMine:ShiftEnded", async ({ event, context }) => {
  const s = await ensureSeason(context);
  const p = await getParams(context);
  const idx = event.args.shift;
  await context.db
    .insert(shift)
    .values({
      id: idx,
      blockIdx: Math.floor(idx / p.shiftsPerBlock),
      endX: event.args.endX,
      totalHashAfter: event.args.totalHashAfter,
      timestamp: event.block.timestamp,
    })
    .onConflictDoNothing();
  await context.db.update(season, { id: s.id }).set((row) => ({
    shift: Math.max(row.shift, idx + 1),
  }));
});

ponder.on("SeasonMine:BlockFound", async ({ event, context }) => {
  const s = await ensureSeason(context);
  const p = await getParams(context);
  const b = event.args.blockIdx;
  const prev = b === 0 ? null : await context.db.find(rewardBlock, { id: b - 1 });
  const startX = prev ? prev.endX : p.openTime * 10n ** 18n;

  await context.db
    .insert(rewardBlock)
    .values({
      id: b,
      endX: event.args.endX,
      foundAt: event.block.timestamp,
      durationX: event.args.endX - startX,
    })
    .onConflictDoNothing();

  if (b === p.blocks - 1) {
    await context.db.update(season, { id: s.id }).set({
      closeX: event.args.endX,
      closedAt: event.block.timestamp,
    });
  }
});

ponder.on("SeasonMine:ClosedByFailSafe", async ({ event, context }) => {
  const s = await ensureSeason(context);
  const closeX = await context.client.readContract({
    abi: context.contracts.SeasonMine.abi,
    address: context.contracts.SeasonMine.address as Address,
    functionName: "closeX",
  });
  await context.db.update(season, { id: s.id }).set((row) => ({
    shift: Math.max(row.shift, event.args.shift),
    closeX,
    closedAt: event.block.timestamp,
    closedByFailSafe: true,
  }));
});

ponder.on("SeasonMine:Claimed", async ({ event, context }) => {
  await ensureSeason(context);
  const r = await requireRig(context, event.args.rigId);
  const b = event.args.blockIdx;
  const amount = event.args.fragments;
  await context.db.insert(claim).values({
    id: event.id,
    rigId: r.id,
    owner: r.owner,
    blockIdx: b,
    fragments: amount,
    timestamp: event.block.timestamp,
  });
  await context.db.update(walletStats, { id: r.owner }).set((row) => ({
    claimed0: b === 0 ? row.claimed0 + amount : row.claimed0,
    claimed1: b === 1 ? row.claimed1 + amount : row.claimed1,
    claimed2: b === 2 ? row.claimed2 + amount : row.claimed2,
    claimed3: b === 3 ? row.claimed3 + amount : row.claimed3,
    totalClaimed: row.totalClaimed + amount,
  }));
});

ponder.on("SeasonMine:Exited", async ({ event, context }) => {
  await ensureSeason(context);
  const r = await deactivate(context, event.args.rigId);
  await context.db.insert(exit).values({
    id: event.id,
    rigId: r.id,
    owner: r.owner,
    kind: "exit",
    returned: event.args.returned,
    fee: event.args.fee,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SeasonMine:Withdrawn", async ({ event, context }) => {
  await ensureSeason(context);
  const r = await deactivate(context, event.args.rigId);
  await context.db.insert(exit).values({
    id: event.id,
    rigId: r.id,
    owner: r.owner,
    kind: "withdraw",
    returned: event.args.amount,
    fee: 0n,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SeasonMine:SeasonCancelled", async ({ event, context }) => {
  const s = await ensureSeason(context);
  await context.db.update(season, { id: s.id }).set({ cancelledAt: event.args.at });
});

// ---------------------------------------------------------------------------------------------
// RedemptionVault
// ---------------------------------------------------------------------------------------------

ponder.on("RedemptionVault:Redeemed", async ({ event, context }) => {
  await context.db.insert(redemption).values({
    id: event.id,
    user: lower(event.args.user),
    blockIdx: Number(event.args.id),
    fragments: event.args.fragments,
    amount: event.args.tokens,
    fee: 0n,
    kind: "redeem",
    timestamp: event.block.timestamp,
  });
});

ponder.on("RedemptionVault:CashedOut", async ({ event, context }) => {
  await context.db.insert(redemption).values({
    id: event.id,
    user: lower(event.args.user),
    blockIdx: Number(event.args.id),
    fragments: event.args.fragments,
    amount: event.args.usdc,
    fee: event.args.fee,
    kind: "cashOut",
    timestamp: event.block.timestamp,
  });
});
