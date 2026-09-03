# Tech spec – smart contracts

Solidity 0.8.x, Foundry, OpenZeppelin 5.x. Interfaces in `specs/contracts/`. All season contracts are
immutable; a new season is a new deployment.

## 1. Architecture

```
                 ┌──────────────┐  deploys per season  ┌────────────────────┐
                 │ SeasonFactory│ ───────────────────▶ │ SeasonMine (core)  │◀── players, poke()
                 └──────────────┘                      │  rigs, hashrate,   │
                        │                              │  work accounting,  │
                        │                              │  claim, exit       │
                        │                              └───────┬────────────┘
                        │                                      │ mint on claim
                        ▼                                      ▼
┌──────────┐     ┌──────────────┐                     ┌────────────────────┐
│ RIG      │◀────│ Treasury     │──fund──────────────▶│ RedemptionVault    │◀── players
│ (ERC-20) │burn │ (multisig)   │  Stock Tokens, USDC │  redeem / cashOut  │
└──────────┘     └──────────────┘                     └───────┬────────────┘
                                                              │ burn on redeem
                                                              ▼
                                                      ┌────────────────────┐
                                                      │ StockFragments     │
                                                      │ (ERC-1155, season) │
                                                      └────────────────────┘
                                          IEligibility ◀── RedemptionVault (redeem gate)
                                          IPriceOracle ◀── RedemptionVault (cashOut)
```

| Contract | Lifetime | Role |
|---|---|---|
| `RIG` | permanent | ERC-20, burnable, permit |
| `SeasonFactory` | permanent | deploys `SeasonMine` + `StockFragments` + `RedemptionVault` from a `SeasonParams` struct; registry |
| `SeasonMine` | one season | staking, upgrades, hashrate, work accounting, block discovery, claims, exit, withdrawals |
| `StockFragments` | one season | ERC-1155; id = block index; minter = `SeasonMine`; burner = `RedemptionVault`; transfers disabled in v1 |
| `RedemptionVault` | one season | holds Stock Tokens + USDC; `redeem`, `cashOut`, `sweep` |
| `IEligibility` | pluggable | `isEligible(address)` for in-kind redemption (doc 07) |
| `IPriceOracle` | pluggable | USD price of each underlying for cash-out |

## 2. Units

| Quantity | Unit | Notes |
|---|---|---|
| hash | 1e18 = one RIG of stake weight at 1.0x | `uint128` |
| time | seconds; boundary timestamps stored as **X-time** = seconds × 1e18 (`uint256`) | exact fractional boundaries |
| work | hash × seconds (1e18-scaled hash × whole seconds, or hash × X-time / 1e18) | `uint256`, ~1e36 max |
| fragments | internal 1e18-scaled ("fragment wei"); whole units at claim | |
| rate | `ratePerWork[b] = S_b × 1e18 / D_b`, fragment-wei per unit work, extra 1e18 for precision | |

## 3. Season parameters

```solidity
struct SeasonParams {
    address rig;
    address lpToken;              // address(0) disables LP staking
    uint256 lpWeightPerToken;     // 1e18-scaled RIG-equivalent per LP token, bonus included
    uint64  openTime;
    uint32  maxDurationSeconds;   // fail-safe close after openTime
    uint8   blocks;               // 4
    uint8   shiftsPerBlock;       // 8
    address[] stocks;             // stocks[b]
    uint256[] poolTokens;         // 1e18-scaled Stock Token amount per block
    uint256[] difficulty;         // hash-seconds per block
    uint256 fragPerToken;         // 1_000_000
    uint256 minStakeWeight;
    uint16  activationFeeBps;
    uint16  earlyExitFeeBps;
    uint16[6] gpuMultBps;
    uint16[5] gpuCostBps;
    uint16[3] coolCostBps;
    uint8[4]  heatPerOc;
    uint8[4]  coolPerShift;
    uint8   heatMax;
    uint16  ocCostBps;
    uint16  ocBoostBps;
    uint8   maxActiveOc;
    uint8   ocShiftSpan;          // 1: expires at end of (currentShift + 1)
    uint32  redemptionDays;
    uint16  cashOutFeeBps;
    uint32  pauseGraceSeconds;
    address treasury;
}
```

Phase is derived: `Funding` until the vault reports funded; `PreOpen` until `openTime`; `Open` until
`closeX != 0`; `Closed` afterwards. `SeasonMine.phase()` is a view.

## 4. Storage

```solidity
struct Rig {
    address owner;
    uint8   asset;            // 0 = RIG, 1 = LP
    uint128 amount;           // deposit
    uint128 weight;           // W
    uint8   gpuTier;
    uint8   coolingTier;
    uint8   heat;
    uint8   activeOc;
    uint16  ocExpiryShift;    // global shift index at whose end the overclocks expire
    uint16  lastShift;        // global shift index at last settlement
    uint256 lastX;            // X-time of last settlement
    uint128 baseHash;         // W × gpuMult
    uint128 ocHash;           // baseHash × ocBoost × activeOc
    uint128[4] earned;        // settled, unclaimed fragment-wei per block
    uint8   claimedMask;
    bool    inactive;         // exited or withdrawn
}

// global
uint16  public shift;                 // current global shift index, 0 .. blocks*shiftsPerBlock-1; == total when closed
uint256 public workInShift;           // work accumulated in the current shift
uint256 public lastX;                 // X-time of last global settlement (≥ openTime × 1e18)
uint256 public totalHash;             // Σ (baseHash + ocHash) over active rigs
mapping(uint16 => uint256) public ocExpiring;   // hash to remove at the end of shift k
mapping(uint16 => uint256) public shiftEndX;    // X-time at which shift k ended (0 = not yet)
uint256 public closeX;                // X-time of close (0 while open)
uint256[4] public ratePerWork;
uint256[4] public mintedFragments;
```

`shiftDifficulty(k) = difficulty[k / shiftsPerBlock] / shiftsPerBlock`. `blockOf(k) = k / shiftsPerBlock`.
Block *b* is found when shift `(b+1) × shiftsPerBlock − 1` ends; `blockEndX(b)` is that shift's `shiftEndX`.

## 5. Accounting math

Because each rig is paid a fixed rate per unit of its own work, there is **no reward-per-share
accumulator**. Global settlement only has to discover *when* shift boundaries happen; rig settlement is
then pure arithmetic over stored boundary timestamps.

### 5.1 Global settlement `_updateGlobal()` (also exposed as `poke()`)

```
if closeX != 0 or block.timestamp < openTime: return
nowX = block.timestamp × 1e18
deadlineX = (openTime + maxDurationSeconds) × 1e18
if nowX > deadlineX: nowX = deadlineX
while lastX < nowX:
    if totalHash == 0:                          # mine idle: no work, no progress
        lastX = nowX; break
    remaining = shiftDifficulty(shift) − workInShift
    span      = remaining × 1e18 / totalHash    # X-seconds until this shift ends at current hash
    if lastX + span > nowX:                     # shift does not end in this window
        workInShift += totalHash × (nowX − lastX) / 1e18
        lastX = nowX
        break
    # shift ends at exactly lastX + span
    endX = lastX + span
    shiftEndX[shift] = endX
    workInShift = 0
    lastX = endX
    totalHash −= ocExpiring[shift]              # every overclock scheduled for this shift expires
    shift += 1
    emit ShiftEnded(shift − 1, endX, totalHash)
    if shift % shiftsPerBlock == 0: emit BlockFound(blockOf(shift − 1), endX)
    if shift == blocks × shiftsPerBlock:        # block 4 found
        closeX = endX; break
if closeX == 0 and nowX == deadlineX:           # fail-safe
    closeX = deadlineX
    emit ClosedByFailSafe(shift)
```

Rounding: `span` floors, so the recorded boundary can be at most `1/1e18` s early and the shift's real
work at most `totalHash / 1e18` short of its difficulty. That dust is never paid out and never carried;
the invariant `minted ≤ pool` holds strictly.

The loop runs once per shift boundary crossed since the last transaction. Worst case is all 32 shifts
in one call (nobody transacted for an entire season). Ops calls `poke()` at least once per expected
shift; the app also calls it opportunistically. Gas per iteration ≈ 2 cold SSTOREs + arithmetic.

### 5.2 Rig settlement `_settleRig(rigId)`

Called (after `_updateGlobal`) at the start of every rig function. Pays the rig for `[rig.lastX, nowX]`
where `nowX = min(block.timestamp × 1e18, closeX or ∞)`.

```
r = rigs[rigId]
fromX = r.lastX
toX   = closeX != 0 ? min(nowX, closeX) : nowX

# 1. base hash, block by block (≤ 4 iterations)
for b in blockOf(r.lastShift) .. blockOf(shift):
    startX = b == 0 ? openTime×1e18 : shiftEndX[b×shiftsPerBlock − 1]
    endX   = blockEndX(b) != 0 ? blockEndX(b) : toX
    lo = max(fromX, startX); hi = min(toX, endX)
    if hi > lo: r.earned[b] += mulDiv(r.baseHash × (hi − lo) / 1e18, ratePerWork[b], 1e18)

# 2. overclock hash, until its expiry shift ended (or now)
if r.ocHash > 0:
    ocEndX = shiftEndX[r.ocExpiryShift] != 0 ? shiftEndX[r.ocExpiryShift] : toX
    for the same blocks, with hi = min(hi, ocEndX):
        r.earned[b] += mulDiv(r.ocHash × (hi − lo) / 1e18, ratePerWork[b], 1e18)
    if shiftEndX[r.ocExpiryShift] != 0:         # expired
        r.ocHash = 0; r.activeOc = 0            # (global totalHash already reduced via ocExpiring)

# 3. heat decay: one step per shift boundary crossed
crossed = shift − r.lastShift
r.heat  = crossed × coolPerShift[r.coolingTier] >= r.heat ? 0 : r.heat − crossed × coolPerShift[r.coolingTier]
r.lastShift = shift
r.lastX = toX
```

`mintedFragments[b]` is increased at claim and checked against `poolTokens[b] × fragPerToken`.

### 5.3 Invariants (fuzz / invariant tests)

1. `Σ_rigs (earned[b] + claimed[b]) ≤ poolTokens[b] × fragPerToken × 1e18` for every *b*, always.
2. `totalHash == Σ_active_rigs (baseHash + ocHash_if_not_expired)` after every transaction.
3. `Σ_k ocExpiring[k] for k ≥ shift == Σ_active_rigs ocHash_if_not_expired`.
4. A rig's `earned[b]` is independent of *when* or how often it settles.
5. For a found block, `Σ_rigs work in block b == difficulty[b]` up to the documented dust.
6. Shift boundaries are monotone and `shiftEndX[k] ≤ shiftEndX[k+1]`.
7. `heat ≤ heatMax`; `activeOc ≤ maxActiveOc`.
8. After close: contract RIG + LP balance equals Σ un-withdrawn deposits of active rigs (fees forwarded).
9. `closeX != 0` implies no rig's `earned` changes afterwards.

## 6. External functions (see `ISeasonMine.sol`)

| Function | Phase | Effect |
|---|---|---|
| `poke()` | any | `_updateGlobal()` only. Public, permissionless. |
| `activate(asset, amount)` | PreOpen, Open | `transferFrom` deposit; `W`; fee to treasury; rig with `baseHash = W`, `lastX = max(nowX, openTime×1e18)`, `lastShift = shift`; `totalHash += W`. |
| `upgradeGpu(rigId)` | PreOpen, Open | burn `W × gpuCostBps[tier]`; `newBase = W × gpuMultBps[tier+1]`; adjust `totalHash`; if `ocHash > 0`, recompute `ocHash` and move the delta in `ocExpiring[ocExpiryShift]`. |
| `upgradeCooling(rigId)` | PreOpen, Open | burn; `coolingTier++`. |
| `overclock(rigId)` | Open | require `activeOc < maxActiveOc` and `heat + heatPerOc ≤ heatMax`; burn `W × ocCostBps`; `heat += …`; `activeOc++`; `newOc = baseHash × ocBoostBps × activeOc / 1e4`; move existing `ocHash` out of `ocExpiring[old]`; `ocExpiryShift = shift + ocShiftSpan`; `ocExpiring[new] += newOc`; `totalHash += newOc − oldOc`; `ocHash = newOc`. |
| `claim(rigId, b)` / `claimAll(rigId)` | block found or closed | settle; `frag = earned[b] / 1e18`; check `mintedFragments[b] + frag ≤ supply`; mint id `b`; zero `earned[b]`. |
| `exit(rigId)` | Open | settle; remove `baseHash + ocHash` from `totalHash` and `ocHash` from its `ocExpiring` bucket; fee `amount × earlyExitFeeBps` to treasury; return remainder; `inactive = true`. Earned stays claimable. |
| `withdraw(rigId)` | Closed | settle; return full deposit; `inactive = true`. |
| `emergencyWithdraw(rigId)` | paused > grace | return deposit; forfeits unclaimed; season cancelled; vault `sweep` enabled early. |
| views | any | `phase()`, `rigHash(rigId)`, `pending(rigId, b)` (simulated), `progress()` (block, shift, workInShift, remaining), `eta()` (seconds to next shift/block/close at current `totalHash`, 0 if idle), `params()` |

Permission: `activate` is by `msg.sender`; other rig functions require `rigs[rigId].owner == msg.sender`.

## 7. StockFragments (ERC-1155)

- `mint(to, id, amount)` only by `SeasonMine`; `burn(from, id, amount)` only by `RedemptionVault`.
- `_update` reverts for transfers where `from != 0 && to != 0` while `transfersEnabled == false`
  (immutable per season; false in v1).
- `uri(id)` returns season metadata (stock symbol, underlying address, `fragPerToken`).

## 8. RedemptionVault

```
fund(usdcReserve)           operator; pulls poolTokens[b] of stocks[b] for each b, and USDC; funded = true.
redeem(id, fragments)       require eligibility.isEligible(msg.sender); require mine closed;
                            tokens = fragments × 1e18 / fragPerToken; burn; transfer stock.
cashOut(id, fragments)      price = oracle.usdPrice(stocks[id]) (staleness ≤ 1h); usdc = tokens × price × (1 − fee);
                            require reserve ≥ usdc; burn; transfer USDC.
sweep()                     after closeX + redemptionDays, or if cancelled: send all balances to treasury.
```

Redemption opens at close (not per block) so the vault never has to reason about which blocks are
found; the mine is the source of truth for claims, the vault only sees fragments.

Eligibility adapters (doc 07): `OpenEligibility`, `MerkleEligibility`, `TokenHookEligibility`.

## 9. Security considerations

| Concern | Handling |
|---|---|
| Reentrancy | `nonReentrant` on all state-changing entry points; checks-effects-interactions; `SafeERC20`; Stock Tokens may have hooks → vault uses pull pattern. |
| Timestamp manipulation | Sequencer controls `block.timestamp` within bounds. A skewed timestamp shifts *when* work is credited, but every rig is credited by the same clock and the rate per work is fixed, so nobody gains relative to anyone else; the fail-safe uses the same clock. |
| Long catch-up loop | Bounded by 32 iterations; `poke()` public; ops keeper; gas per iteration small. A pathological 32-iteration call is still well under the block gas limit. |
| Rounding | Boundaries floor to 1e-18 s; claims floor to whole fragments; `mintedFragments ≤ supply` enforced. |
| Overflow | Hash is bounded by 1B RIG × 5x = 5e27; over the 30-day fail-safe that is ≤ 1.3e34 work, and × 1e18 rate scaling ≤ 1.3e52, far below `uint256`. `uint128` for per-rig hash; `mulDiv` for every three-factor product. |
| Admin risk during a live season | Only `pause`; paused > grace → cancellation path. No parameter setters, no difficulty setter. |
| LP weight manipulation | Fixed at deployment from a 24h TWAP; deployment ≥ 48h before `openTime`. |
| Sybil / many rigs | No benefit: pay is linear in hash; upgrades are percent-of-weight. |
| Boundary timing games | Boundaries are computed retroactively from work; no transaction "finds" a block. Overclocking one second before a shift ends is allowed and merely wasteful; the UI warns. |
| Exit/re-enter churn | Exit fee 3%; upgrades lost; nothing gained. |
| Idle mine with stuck stakes | `exit` any time; fail-safe close. |
| Stock Token transfer hooks failing at redemption | `redeem` reverts cleanly; `cashOut` alternative; `sweep` uses `try/catch` per asset. |
| Factory misconfiguration | `create` validates: arrays length `blocks == 4`; `gpuMultBps` strictly increasing from 10000; `ocBoostBps × maxActiveOc ≤ 30000`; `heatPerOc[c] ≤ heatMax`; `difficulty[b] > 0` and divisible by `shiftsPerBlock`; `maxDurationSeconds ≥ 14 days`; `openTime ≥ now + 48h`. |

## 10. Gas (measured, via-IR, unit suite; Arbitrum-family chain)

| Tx | Typical | Worst seen | Note |
|---|---|---|---|
| `activate` | ~250k | 284k | first rig for an address pays cold storage |
| `upgradeGpu` / `upgradeCooling` | ~90k | 133k | includes settlement |
| `overclock` | ~108k | 146k | |
| `claim` (one block) | ~147k | 216k | one ERC-1155 mint |
| `claimAll` (4 blocks) | ~437k | 481k | four mints |
| `exit` / `withdraw` | ~80–96k | 188k | |
| `poke` | ~34k idle | 963k | worst case: all 32 shifts crossed in one call; the keeper keeps it short |

Original targets (activate ≤ 220k, claimAll ≤ 260k) were optimistic; see `docs/DECISIONS.md`
2026-09-03. Optimisation is a Phase 4 item.

## 11. Events

`SeasonFunded`, `RigActivated(rigId, owner, asset, amount, weight, fee)`, `GpuUpgraded(rigId, tier, burned)`,
`CoolingUpgraded(rigId, tier, burned)`, `Overclocked(rigId, shift, activeOc, expiryShift, heat, burned)`,
`ShiftEnded(shift, endX, totalHashAfter)`, `BlockFound(blockIdx, endX)`, `ClosedByFailSafe(shift)`,
`Claimed(rigId, blockIdx, fragments)`, `Exited(rigId, returned, fee)`, `Withdrawn(rigId, amount)`,
`Paused/Unpaused`, `SeasonCancelled`, `Redeemed(user, id, fragments, tokens)`,
`CashedOut(user, id, fragments, usdc, fee)`, `Swept`.

## 12. Deployment sequence (per season)

1. Compute `lpWeightPerToken` from TWAP and `difficulty[]` from the sizing model; publish params JSON + hash.
2. `SeasonFactory.create(params, …)` → addresses. Verify on explorer.
3. Treasury approves and calls `RedemptionVault.fund()`; confirm `funded == true` and `phase() == PreOpen`.
4. App points at the new season (reads the factory registry). Keeper starts calling `poke()` on a
   cadence of ~¼ of the planned shift length.
5. `openTime` reached → work starts accruing without any transaction.
