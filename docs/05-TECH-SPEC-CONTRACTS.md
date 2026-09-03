# Tech spec – smart contracts

Solidity 0.8.x, Foundry, OpenZeppelin 5.x. Interfaces in `specs/contracts/`. All season contracts are
immutable; a new season is a new deployment.

## 1. Architecture

```
                 ┌──────────────┐  deploys per season  ┌────────────────────┐
                 │ SeasonFactory│ ───────────────────▶ │ SeasonMine (core)  │◀── players
                 └──────────────┘                      │  rigs, hashrate,   │
                        │                              │  accounting, claim │
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
| `SeasonFactory` | permanent | deploys `SeasonMine` + `StockFragments` + `RedemptionVault` for a season from a `SeasonParams` struct; registry of seasons |
| `SeasonMine` | one season | staking, upgrades, hashrate, emission accounting, claims, withdrawals |
| `StockFragments` | one season | ERC-1155; id = index of the stock in the season; minter = `SeasonMine`; burner = `RedemptionVault`; transfers disabled in v1 except mint/burn |
| `RedemptionVault` | one season | holds Stock Tokens + USDC; `redeem`, `cashOut`, `sweep` |
| `IEligibility` | pluggable | `isEligible(address) → bool` for in-kind redemption (doc 07) |
| `IPriceOracle` | pluggable | USD price of each underlying for cash-out |

## 2. Season parameters

`SeasonParams` (immutable in `SeasonMine`; JSON twin in `specs/params/season-default.json`):

```solidity
struct SeasonParams {
    address rig;                 // RIG token
    address lpToken;             // address(0) disables LP staking
    uint256 lpWeightPerToken;    // 1e18-scaled RIG-equivalent per LP token, incl. bonus
    uint64  openTime;            // T0
    uint32  blockSeconds;        // 21600
    uint8   blocks;              // 4
    address[] stocks;            // stocks[b] for block b
    uint256[] poolTokens;        // 1e18-scaled Stock Token amount per block
    uint256 fragPerToken;        // 1_000_000
    uint256 minStakeWeight;
    uint16  activationFeeBps;
    uint16[6] gpuMultBps;
    uint16[5] gpuCostBps;
    uint16[3] coolCostBps;
    uint8[4]  heatPerOc;
    uint8[4]  coolPerBlock;
    uint8   heatMax;
    uint16  ocCostBps;
    uint16  ocBoostBps;
    uint8   maxOcPerBlock;
    uint32  redemptionDays;
    uint16  cashOutFeeBps;
    uint32  pauseGraceSeconds;   // e.g. 6h: paused longer than this → season cancelled
    address treasury;
}
```

Phase is derived: `Funding` until the vault reports funded; `PreOpen` until `openTime`; `Open` until
`openTime + blocks × blockSeconds`; `Closed` afterwards. `SeasonMine.phase()` is a view.

## 3. Storage

```solidity
struct Rig {
    address owner;
    uint8   asset;        // 0 = RIG, 1 = LP
    uint128 amount;       // deposit, returned at close
    uint128 weight;       // W
    uint8   gpuTier;
    uint8   coolingTier;
    uint8   heat;
    uint8   ocCount;      // overclocks in `lastBlock`
    uint8   lastBlock;    // block index at last settlement (0..blocks-1; blocks == "closed")
    uint128 baseHash;     // W × gpuMult
    uint128 ocHash;       // extra hash from overclocks this block
    uint256 debt;         // accPerHash[lastBlock] at last settlement (1e18 scaled)
    uint128[4] earned;    // settled fragments per block, not yet claimed (1e18 scaled)
    uint8   claimedMask;  // bit b set once block b claimed
    bool    withdrawn;
}

// global
uint256 public totalHash;            // Σ (baseHash + ocHash) of active rigs
uint256 public totalOcHash;          // Σ ocHash, removed at the next boundary
uint256 public accPerHash;           // accumulator for the current block, resets at boundary
uint256[4] public accAtEnd;          // final accumulator value of each finished block
uint8   public currentBlock;         // last block that has been settled into
uint64  public lastUpdate;           // timestamp of last global settlement
uint256[4] public ratePerSecond;     // poolTokens[b] × fragPerToken / blockSeconds, 1e18 scaled
uint256[4] public mintedFragments;   // for the invariant mintedFragments[b] ≤ pool supply
```

## 4. Accounting math

Standard reward-per-share, with two extensions: (a) the accumulator is **per block** so each block can
be claimed independently and hashrate changes at boundaries are handled; (b) overclock hash is tracked
separately so it can be removed at boundaries without touching each rig.

### 4.1 Global settlement `_updateGlobal()`

Called at the start of every state-changing function.

```
t_now = min(block.timestamp, closeTime)
while lastUpdate < t_now:
    b        = currentBlock
    b_end    = openTime + (b+1) × blockSeconds
    t_to     = min(t_now, b_end)
    if totalHash > 0:
        accPerHash += ratePerSecond[b] × (t_to − lastUpdate) × 1e18 / totalHash
    lastUpdate = t_to
    if t_to == b_end:                       # crossing a boundary
        accAtEnd[b] = accPerHash
        totalHash  -= totalOcHash           # every overclock expires
        totalOcHash = 0
        accPerHash  = 0
        currentBlock = b + 1
        if currentBlock == blocks: break    # closed; no further emission
```

Before `openTime` nothing accrues (`lastUpdate` is initialised to `openTime`). The loop runs at most
4 iterations ever, and at most once per boundary in practice.

When `totalHash == 0` the accumulator does not advance for that interval, so those fragments are never
minted (FR-M3).

### 4.2 Rig settlement `_settleRig(rigId)`

```
r = rigs[rigId]
if r.lastBlock == currentBlock:
    r.earned[currentBlock] += (accPerHash − r.debt) × (r.baseHash + r.ocHash) / 1e18
else:
    # block in which the rig was last settled: finish it with its overclock
    r.earned[r.lastBlock] += (accAtEnd[r.lastBlock] − r.debt) × (r.baseHash + r.ocHash) / 1e18
    # intermediate finished blocks: base hash only, accumulator started at 0
    for b in r.lastBlock+1 .. currentBlock−1:
        r.earned[b] += accAtEnd[b] × r.baseHash / 1e18
    # current (unfinished) block, if still open
    if currentBlock < blocks:
        r.earned[currentBlock] += accPerHash × r.baseHash / 1e18
    # boundary effects on the rig
    boundaries = currentBlock − r.lastBlock
    r.heat     = max(0, r.heat − coolPerBlock[r.coolingTier] × boundaries)
    r.ocHash   = 0
    r.ocCount  = 0
    r.lastBlock = currentBlock
r.debt = accPerHash
```

Multiplications are `mulDiv` (OZ `Math.mulDiv`) to avoid overflow. Per-rig loops are bounded by 4.

### 4.3 Invariants (fuzz/invariant tests)

1. `Σ_rigs earned[b] + Σ_rigs claimed[b] ≤ poolTokens[b] × fragPerToken` for every b, always.
2. `totalHash == Σ_active_rigs (baseHash + ocHash)` after every transaction.
3. `totalOcHash == Σ_active_rigs ocHash` after every transaction.
4. A rig's `earned[b]` is non-decreasing and independent of *when* it settles (settling twice gives the
   same result as settling once).
5. After close: `SeasonMine` RIG + LP balance equals Σ un-withdrawn deposits (fees already forwarded).
6. `heat ≤ heatMax` always; `ocCount ≤ maxOcPerBlock` always.

## 5. External functions (see `ISeasonMine.sol`)

| Function | Phase | Effect |
|---|---|---|
| `activate(asset, amount)` | PreOpen, Open | `transferFrom` deposit; compute `W`; charge fee (RIG `transferFrom` to treasury); create rig with `baseHash = W`, `debt = accPerHash`; `totalHash += W`. In PreOpen `lastUpdate == openTime` and the settlement loop is a no-op, so the hash is counted but nothing accrues until `T0`. Emits `RigActivated`. |
| `upgradeGpu(rigId)` | PreOpen, Open | burn `W × gpuCostBps[tier]`; `newBase = W × gpuMultBps[tier+1]`; adjust `totalHash` by `newBase − baseHash`; if `ocCount > 0`, recompute `ocHash = newBase × ocBoost × ocCount` and adjust `totalOcHash`/`totalHash` accordingly. |
| `upgradeCooling(rigId)` | PreOpen, Open | burn; `coolingTier++`. No hash change. |
| `overclock(rigId)` | Open | checks heat/ocCount; burn `W × ocCostBps`; `heat += heatPerOc`; `ocCount++`; `delta = baseHash × ocBoostBps / 1e4`; `ocHash += delta`; `totalOcHash += delta`; `totalHash += delta`. |
| `claim(rigId, b)` / `claimAll(rigId)` | after block b end | settle; mint `earned[b] / 1e18` fragments of id `b` to owner; zero `earned[b]`; set mask. |
| `withdraw(rigId)` | Closed | settle; `totalHash −= hash` (no-op economically after close); transfer deposit back; `withdrawn = true`. |
| `emergencyWithdraw(rigId)` | paused > grace | return deposit; forfeits unclaimed; season flagged cancelled; vault `sweep` enabled early. |
| views | any | `phase()`, `rigHash(rigId)`, `pending(rigId, b)` (settled + unsettled, simulated), `blockInfo(b)`, `params()` |

Permission: `activate` is by `msg.sender`; every other rig function requires `rigs[rigId].owner == msg.sender`.

## 6. StockFragments (ERC-1155)

- `mint(to, id, amount)` only by `SeasonMine`.
- `burn(from, id, amount)` only by `RedemptionVault`.
- `_update` reverts for transfers where `from != 0 && to != 0` while `transfersEnabled == false`.
  `transfersEnabled` is immutable per season (set false for v1). If a later season enables it, this is
  the only line that changes.
- `uri(id)` returns season metadata (stock symbol, underlying address, `fragPerToken`).

## 7. RedemptionVault

```
fund()                      operator; pulls poolTokens[b] of stocks[b] for each b, and the USDC reserve;
                            sets funded = true; SeasonMine reads this to leave Funding phase.
redeem(id, fragments)       require eligibility.isEligible(msg.sender);
                            tokens = fragments × 1e18 / fragPerToken; burn fragments; transfer stock.
cashOut(id, fragments)      price = oracle.usdPrice(stocks[id]); usdc = tokens × price × (1 − fee);
                            require reserve ≥ usdc; burn; transfer USDC; fee stays in vault.
sweep()                     after close + redemptionDays (or cancelled): send all balances to treasury.
```

Eligibility adapters planned (doc 07): `OpenEligibility` (everyone), `MerkleEligibility` (allowlist
root), `TokenHookEligibility` (calls the Stock Token's own transfer-restriction check via `staticcall`).

## 8. Security considerations

| Concern | Handling |
|---|---|
| Reentrancy | `nonReentrant` on all state-changing entry points; checks-effects-interactions; RIG/LP are known tokens (no fee-on-transfer), Stock Tokens may have hooks → vault uses pull pattern and OZ `SafeERC20`. |
| Timestamp manipulation | Sequencer controls `block.timestamp` within bounds; 6-hour blocks and 1e18-precision make second-level drift immaterial. `closeTime` is enforced with `min()`, so a late settlement can never over-emit. |
| Rounding | Accumulator 1e18-scaled; claims round down; dust stays unminted. Invariant 1 tested with fuzzing. |
| Overflow | `uint128` for hash/amounts caps at 3.4e38 wei, far above 1B RIG × 5x; `mulDiv` for products. |
| Admin risk during a live season | Only `pause`; paused > grace → cancellation path. No parameter setters. Treasury cannot pull from `SeasonMine`. |
| LP weight manipulation | Fixed at deployment from a 24h TWAP computed off-chain and published; deployment ≥ 48h before `openTime` so it can be challenged. |
| Sybil / many rigs | No benefit: rewards are linear in weight; upgrades are percent-of-weight. |
| Front-running | No MEV surface: rewards are time-based, not order-based. Overclocking right before a boundary is allowed and merely wasteful. |
| Stock Token transfer hooks failing at redemption | `redeem` reverts cleanly; user can `cashOut` instead; `sweep` uses `try/catch` per asset. |
| Factory misconfiguration | `SeasonFactory.create` validates array lengths, monotone tiers, `ocBoost × maxOc ≤ 30000`, `blocks == 4`, `openTime ≥ now + 48h`. |

## 9. Gas targets (Arbitrum-family estimates)

| Tx | Target |
|---|---|
| `activate` | ≤ 200k |
| `upgradeGpu` / `overclock` | ≤ 150k |
| `claimAll` (4 blocks) | ≤ 250k |
| `withdraw` | ≤ 120k |

## 10. Events

`SeasonFunded`, `RigActivated(rigId, owner, asset, amount, weight)`, `GpuUpgraded(rigId, tier, burned)`,
`CoolingUpgraded(rigId, tier, burned)`, `Overclocked(rigId, blockIdx, ocCount, heat, burned)`,
`BlockSettled(blockIdx, accAtEnd, totalHashAfter)`, `Claimed(rigId, blockIdx, fragments)`,
`Withdrawn(rigId, amount)`, `Paused/Unpaused`, `SeasonCancelled`, `Redeemed(user, id, fragments, tokens)`,
`CashedOut(user, id, fragments, usdc)`, `Swept`.

## 11. Deployment sequence (per season)

1. Compute `lpWeightPerToken` from TWAP; publish params JSON + hash.
2. `SeasonFactory.create(params)` → addresses. Verify on explorer.
3. Treasury approves and calls `RedemptionVault.fund()`; confirm `funded == true` and `phase() == PreOpen`.
4. App points at the new season (reads the factory registry).
5. `openTime` reached → block 1 starts without any transaction.
