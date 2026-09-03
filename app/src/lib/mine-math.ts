/**
 * Pure TypeScript reproduction of SeasonMine's settlement math (docs/05 §5), used for the live
 * estimate and ETA between polls. Kept bit-exact with the contract; the parity test in
 * test/parity.test.ts checks it against Foundry's pending()/eta() on Anvil.
 *
 * Units: hash 1e18-scaled; X-time = seconds × 1e18; work = hash × dtX / 1e18;
 * ratePerWork = fragWei × 1e18 / difficulty; earned (fragment-wei) = work × rate / 1e18.
 */
export const WAD = 10n ** 18n;

export interface SeasonConfig {
  openTime: bigint;
  maxDurationSeconds: bigint;
  shiftsPerBlock: number;
  blocks: number;
  difficulty: bigint[]; // per block, 1e18-scaled hash-seconds
  ratePerWork: bigint[]; // per block
  coolPerShift: number[]; // per cooling tier
}

export interface GlobalState {
  shift: number;
  workInShift: bigint;
  lastX: bigint;
  totalHash: bigint;
  closeX: bigint;
  ocExpiring: Record<number, bigint>; // bucket per shift index (only unconsumed ones matter)
  shiftEndX: Record<number, bigint>; // discovered boundaries
}

export interface RigState {
  inactive: boolean;
  lastShift: number;
  lastX: bigint;
  baseHash: bigint;
  ocHash: bigint;
  ocExpiryShift: number;
  activeOc: number;
  heat: number;
  coolingTier: number;
  earned: bigint[]; // 4 × fragment-wei
}

export function mulDiv(a: bigint, b: bigint, d: bigint): bigint {
  return (a * b) / d;
}

function totalShifts(c: SeasonConfig): number {
  return c.blocks * c.shiftsPerBlock;
}

function shiftDiff(c: SeasonConfig, shift: number): bigint {
  return c.difficulty[Math.floor(shift / c.shiftsPerBlock)] / BigInt(c.shiftsPerBlock);
}

/** Mirror of `_advanceView`: advances a copy of the global state to `nowSec`, returning it plus the boundaries discovered. */
export function advance(c: SeasonConfig, g0: GlobalState, nowSec: bigint): { g: GlobalState; ends: Record<number, bigint> } {
  const g: GlobalState = { ...g0, ocExpiring: { ...g0.ocExpiring }, shiftEndX: { ...g0.shiftEndX } };
  const ends: Record<number, bigint> = {};
  if (g.closeX !== 0n || nowSec < c.openTime) return { g, ends };
  const deadlineX = (c.openTime + c.maxDurationSeconds) * WAD;
  let nowX = nowSec * WAD;
  if (nowX > deadlineX) nowX = deadlineX;
  const total = totalShifts(c);
  while (g.lastX < nowX) {
    if (g.totalHash === 0n) {
      g.lastX = nowX;
      break;
    }
    const sd = shiftDiff(c, g.shift);
    const remaining = sd - g.workInShift;
    const spanX = mulDiv(remaining, WAD, g.totalHash);
    if (g.lastX + spanX > nowX) {
      g.workInShift += mulDiv(g.totalHash, nowX - g.lastX, WAD);
      g.lastX = nowX;
      break;
    }
    const endX = g.lastX + spanX;
    const s = g.shift;
    ends[s] = endX;
    g.shiftEndX[s] = endX;
    g.workInShift = 0n;
    g.lastX = endX;
    g.totalHash -= g.ocExpiring[s] ?? 0n;
    delete g.ocExpiring[s];
    g.shift = s + 1;
    if (g.shift === total) {
      g.closeX = endX;
      return { g, ends };
    }
  }
  if (g.closeX === 0n && nowX === deadlineX && g.lastX === deadlineX) g.closeX = deadlineX;
  return { g, ends };
}

function endX(g: GlobalState, idx: number): bigint {
  return g.shiftEndX[idx] ?? 0n;
}

/** Mirror of `_settleCalc`: returns the rig settled against an advanced global state. */
export function settle(c: SeasonConfig, r0: RigState, g: GlobalState): RigState {
  const r: RigState = { ...r0, earned: [...r0.earned] };
  const total = totalShifts(c);
  const spb = c.shiftsPerBlock;
  let toX = g.lastX;
  if (g.closeX !== 0n && toX > g.closeX) toX = g.closeX;
  const fromX = r.lastX;
  const openX = c.openTime * WAD;
  if (toX > fromX && !r.inactive) {
    const cur = g.shift >= total ? total - 1 : g.shift;
    const bFrom = r.lastShift >= total ? c.blocks - 1 : Math.floor(r.lastShift / spb);
    const bTo = Math.floor(cur / spb);
    let ocEnd = 0n;
    if (r.ocHash > 0n) {
      ocEnd = endX(g, r.ocExpiryShift);
      if (ocEnd === 0n) ocEnd = toX;
    }
    for (let b = bFrom; b <= bTo; b++) {
      const startX = b === 0 ? openX : endX(g, b * spb - 1);
      let eX = endX(g, (b + 1) * spb - 1);
      if (eX === 0n) eX = toX;
      const lo = fromX > startX ? fromX : startX;
      const hi = toX < eX ? toX : eX;
      if (hi <= lo) continue;
      let e = mulDiv(mulDiv(r.baseHash, hi - lo, WAD), c.ratePerWork[b], WAD);
      if (r.ocHash > 0n) {
        const hi2 = hi < ocEnd ? hi : ocEnd;
        if (hi2 > lo) e += mulDiv(mulDiv(r.ocHash, hi2 - lo, WAD), c.ratePerWork[b], WAD);
      }
      r.earned[b] += e;
    }
  }
  if (r.ocHash > 0n && endX(g, r.ocExpiryShift) !== 0n) {
    r.ocHash = 0n;
    r.activeOc = 0;
  }
  const crossed = g.shift > r.lastShift ? g.shift - r.lastShift : 0;
  if (crossed > 0 && r.heat > 0) {
    const dec = crossed * c.coolPerShift[r.coolingTier];
    r.heat = dec >= r.heat ? 0 : r.heat - dec;
  }
  r.lastShift = g.shift;
  r.lastX = toX;
  return r;
}

/** Whole fragments pending for block b at `nowSec` (mirror of `pending()`). */
export function pending(c: SeasonConfig, g0: GlobalState, r0: RigState, nowSec: bigint, b: number): bigint {
  const { g } = advance(c, g0, nowSec);
  const r = settle(c, r0, g);
  return r.earned[b] / WAD;
}

export interface Eta {
  idle: boolean;
  closed: boolean;
  toShiftEnd: bigint;
  toBlockFound: bigint;
  toClose: bigint;
}

/** Mirror of `eta()`: seconds at the current total hash. */
export function eta(c: SeasonConfig, g0: GlobalState, nowSec: bigint): Eta {
  const { g } = advance(c, g0, nowSec);
  if (g.closeX !== 0n) return { idle: false, closed: true, toShiftEnd: 0n, toBlockFound: 0n, toClose: 0n };
  if (g.totalHash === 0n) return { idle: true, closed: false, toShiftEnd: 0n, toBlockFound: 0n, toClose: 0n };
  const spb = c.shiftsPerBlock;
  const b = Math.floor(g.shift / spb);
  const sd = shiftDiff(c, g.shift);
  const remShift = sd - g.workInShift;
  const shiftsLeft = BigInt(spb - (g.shift % spb) - 1);
  const remBlock = remShift + shiftsLeft * sd;
  let remSeason = remBlock;
  for (let k = b + 1; k < c.blocks; k++) remSeason += c.difficulty[k];
  return {
    idle: false,
    closed: false,
    toShiftEnd: remShift / g.totalHash,
    toBlockFound: remBlock / g.totalHash,
    toClose: remSeason / g.totalHash,
  };
}

/** Fragments per second for a rig at hash `h` in block `b`, as a JS number for display. */
export function fragmentsPerSecond(c: SeasonConfig, h: bigint, b: number): number {
  const wei = mulDiv(mulDiv(h, WAD, WAD), c.ratePerWork[b], WAD); // one second of work
  return Number(wei) / 1e18;
}

/** Progress of the current block in basis points, from an advanced global state. */
export function blockProgressBps(c: SeasonConfig, g: GlobalState): number {
  const spb = c.shiftsPerBlock;
  if (g.shift >= totalShifts(c)) return 10_000;
  const sd = shiftDiff(c, g.shift);
  const doneShifts = BigInt(g.shift % spb);
  const done = doneShifts * sd + g.workInShift;
  return Number((done * 10_000n) / (sd * BigInt(spb)));
}
