import { index, onchainEnum, onchainTable } from "ponder";

/**
 * Indexer schema (docs/06 §5). All amounts are raw on-chain units: RIG/LP wei, fragment wei,
 * X-time (seconds × 1e18), hash units. Addresses are stored lowercase.
 */

export const burnKind = onchainEnum("burn_kind", ["gpu", "cooling", "overclock"]);
export const exitKind = onchainEnum("exit_kind", ["exit", "withdraw"]);
export const redemptionKind = onchainEnum("redemption_kind", ["redeem", "cashOut"]);

/** One row per indexed season; id = SeasonMine address. */
export const season = onchainTable("season", (t) => ({
  id: t.hex().primaryKey(),
  mine: t.hex().notNull(),
  openTime: t.bigint().notNull(),
  blocks: t.integer().notNull(),
  shiftsPerBlock: t.integer().notNull(),
  /** Current global shift index (== blocks × shiftsPerBlock once closed). */
  shift: t.integer().notNull(),
  /** X-time of close; null while open. */
  closeX: t.bigint(),
  closedAt: t.bigint(),
  closedByFailSafe: t.boolean().notNull(),
  cancelledAt: t.bigint(),
}));

/** One row per ended shift; id = global shift index. */
export const shift = onchainTable("shift", (t) => ({
  id: t.integer().primaryKey(),
  blockIdx: t.integer().notNull(),
  endX: t.bigint().notNull(),
  totalHashAfter: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

/** One row per found reward block; id = block index. */
export const rewardBlock = onchainTable("reward_block", (t) => ({
  id: t.integer().primaryKey(),
  endX: t.bigint().notNull(),
  foundAt: t.bigint().notNull(),
  /** Seconds between the previous block's endX (or openTime) and this one's, in X units. */
  durationX: t.bigint().notNull(),
}));

export const rig = onchainTable(
  "rig",
  (t) => ({
    id: t.bigint().primaryKey(),
    owner: t.hex().notNull(),
    /** 0 = RIG, 1 = LP */
    asset: t.integer().notNull(),
    amount: t.bigint().notNull(),
    weight: t.bigint().notNull(),
    gpuTier: t.integer().notNull(),
    coolingTier: t.integer().notNull(),
    /** weight × gpuMultBps[gpuTier] / 10000 */
    baseHash: t.bigint().notNull(),
    heat: t.integer().notNull(),
    activeOc: t.integer().notNull(),
    ocExpiryShift: t.integer().notNull(),
    active: t.boolean().notNull(),
    activationFee: t.bigint().notNull(),
    createdAt: t.bigint().notNull(),
  }),
  (table) => ({ ownerIdx: index().on(table.owner) }),
);

export const overclock = onchainTable(
  "overclock",
  (t) => ({
    id: t.text().primaryKey(),
    rigId: t.bigint().notNull(),
    shift: t.integer().notNull(),
    activeOc: t.integer().notNull(),
    expiryShift: t.integer().notNull(),
    heat: t.integer().notNull(),
    burned: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({ rigIdx: index().on(table.rigId) }),
);

export const burn = onchainTable(
  "burn",
  (t) => ({
    id: t.text().primaryKey(),
    rigId: t.bigint().notNull(),
    owner: t.hex().notNull(),
    kind: burnKind().notNull(),
    amount: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({ rigIdx: index().on(table.rigId), ownerIdx: index().on(table.owner) }),
);

export const claim = onchainTable(
  "claim",
  (t) => ({
    id: t.text().primaryKey(),
    rigId: t.bigint().notNull(),
    owner: t.hex().notNull(),
    blockIdx: t.integer().notNull(),
    fragments: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({ rigIdx: index().on(table.rigId), ownerIdx: index().on(table.owner) }),
);

export const exit = onchainTable(
  "exit",
  (t) => ({
    id: t.text().primaryKey(),
    rigId: t.bigint().notNull(),
    owner: t.hex().notNull(),
    kind: exitKind().notNull(),
    returned: t.bigint().notNull(),
    fee: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({ rigIdx: index().on(table.rigId) }),
);

export const redemption = onchainTable(
  "redemption",
  (t) => ({
    id: t.text().primaryKey(),
    user: t.hex().notNull(),
    blockIdx: t.integer().notNull(),
    fragments: t.bigint().notNull(),
    /** Stock Token wei for `redeem`, USDC (6 dp) net of fee for `cashOut`. */
    amount: t.bigint().notNull(),
    fee: t.bigint().notNull(),
    kind: redemptionKind().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({ userIdx: index().on(table.user) }),
);

/** Per-wallet aggregates over active rigs; id = wallet address. */
export const walletStats = onchainTable("wallet_stats", (t) => ({
  id: t.hex().primaryKey(),
  /** Active rig count. */
  rigs: t.integer().notNull(),
  /** Rigs ever activated. */
  rigsActivated: t.integer().notNull(),
  /** Σ weight over active rigs. */
  totalWeight: t.bigint().notNull(),
  /** Σ baseHash over active rigs (overclock boosts are transient and excluded). */
  totalHash: t.bigint().notNull(),
  totalBurned: t.bigint().notNull(),
  claimed0: t.bigint().notNull(),
  claimed1: t.bigint().notNull(),
  claimed2: t.bigint().notNull(),
  claimed3: t.bigint().notNull(),
  totalClaimed: t.bigint().notNull(),
}));
