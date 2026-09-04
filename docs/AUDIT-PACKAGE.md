# Stock Miner – audit package

Prepared 2026-09-04 for an external review of the season contracts. Everything referenced is in this
repository at the commit tagged in `docs/BUILD-LOG.md` (Phase 4 entry).

## 1. Scope

| Contract | Lines | Role |
|---|---|---|
| `contracts/src/SeasonMine.sol` | ~640 | the mine: staking, upgrades, work-based block discovery, per-rig accounting, claims, exits, pause |
| `contracts/src/StockFragments.sol` | 56 | per-season ERC-1155, id = block; mint by mine, burn by vault, non-transferable |
| `contracts/src/RedemptionVault.sol` | ~170 | holds Stock Tokens + USDC; funding, in-kind redemption, cash-out, sweep |
| `contracts/src/SeasonFactory.sol` | ~130 | parameter validation, deterministic deployment of the three above |
| `contracts/src/factory/Deployers.sol`, `CreateAddress.sol` | 123 | per-contract deployers (EIP-170 split) and CREATE address prediction |
| `contracts/src/tokens/RIG.sol` | 17 | fixed-supply ERC-20 with `ERC20Burnable` and permit |
| `contracts/src/adapters/*` | 43 | `OpenEligibility`, `AllowlistEligibility` (owner-mutable, outside the immutable set) |

Out of scope: mocks (`src/mocks/*`, they model expected external restrictions), scripts, the app,
the indexer, the Python simulation (used as the differential-testing oracle, §6).

Interfaces in `specs/contracts/*.sol` are the source of truth and byte-identical to
`contracts/src/interfaces/` (CI checks). Specs: `docs/05-TECH-SPEC-CONTRACTS.md` (math in §5,
invariants in §5.3), `docs/03-GAME-DESIGN.md` (formulas), `docs/01-PRD.md` (requirement ids).

Compiler: solc 0.8.28, via-IR, optimizer 200 runs, EVM `cancun`. OpenZeppelin 5.2.0.

## 2. Trust assumptions

1. **Season contracts are immutable.** No proxies, no setters, no difficulty adjustment. The only
   privileged function is `pause`/`unpause` by the season's `treasury` address.
2. **$RIG** is `contracts/src/tokens/RIG.sol` or an equivalent: standard ERC-20, no hooks, no
   fee-on-transfer, `burnFrom` with allowance. Upgrade spend is burned from the player.
3. **The LP token** is a fungible ERC-20 (Uniswap v2 shape) chosen at deployment; standard transfer
   semantics. Its weight (`lpWeightPerToken`) is fixed at creation from a 24 h sampled reserve ratio.
4. **Stock Tokens** may have transfer hooks that revert for non-allowlisted parties. The vault treats
   them as opaque ERC-20s that may revert; the mine never touches them.
5. **The oracle** (`IPriceOracle`) is trusted for `cashOut` only, with a 1 h staleness cap. In-kind
   redemption never depends on it.
6. **The eligibility adapter** decides who may receive Stock Tokens in kind. It is external and may
   be mutable (issuer KYC lists change).
7. **Sequencer timestamps** are honest within the usual bounds. All work is credited by the same
   clock at a fixed rate per unit of work, so timestamp skew cannot favour one rig over another.
8. **Chain assumptions** in `docs/01-PRD.md` §10 (Orbit L2, hooks, DEX, oracle) are unverified as of
   this package; the code is built against mocks of the expected restrictions.

## 3. Actors and powers

| Actor | Can | Cannot |
|---|---|---|
| Player | activate (RIG or LP), upgrade GPU / cooling, overclock, claim, exit (3% fee), withdraw after close, `emergencyWithdraw` when a pause outlives the grace period, redeem / cash out fragments | change anyone else's rig; claim more than the pool (`mintedFragments[b] ≤ supply[b]` enforced in `_claim`) |
| Anyone | `poke()` (advance shift discovery), `sweep()` after the window or a cancellation | alter accounting: `poke` is a pure catch-up |
| Guardian (= `treasury`) | `pause`, `unpause` (not after cancellation); receives fees and sweeps | set parameters, mint, move stakes, cancel directly |
| Operator (factory caller) | `fund` the vault once | withdraw pool or reserve (only `sweep` to the treasury after the window) |
| Factory | deploy seasons with validated params | touch a deployed season |
| Deployer of the deployers | `init(factory)` once | anything after init |

**The one real power: pause.** A pause blocks every player action but not the clock. If it lasts
longer than `pauseGraceSeconds` (default 6 h), any player may `emergencyWithdraw`, which returns
their deposit and, if the season was still open, cancels it: unclaimed fragments are forfeited and
the vault becomes sweepable to the treasury at once. A guardian can therefore end an open season
early and the treasury receives the unredeemed pool. This is by design (FR-S6: the cancel path must
return stakes) and must be disclosed in the terms (docs/07 §5). A season that has already closed
cannot be cancelled this way (Phase 4 fix, §7).

## 4. The accounting argument

Units: hash and stake weight are 1e18-scaled; X-time is seconds × 1e18; work = hash × ΔX / 1e18;
fragments are tracked as 1e18-scaled fragment-wei and minted whole.

1. **Blocks are found by work, not time.** Global state is `(shift, workInShift, lastX, totalHash)`.
   `_advanceView` walks from `lastX` to now: while the remaining work of the current shift can be
   done with the current `totalHash` before now, it records the exact boundary
   `endX = lastX + floor(remaining × 1e18 / totalHash)`, subtracts the overclock hash expiring at
   that shift, and continues; otherwise it credits partial work and stops. Total hash is piecewise
   constant between transactions and changes only at boundaries (expiries) or in the transaction
   itself (after settlement), so boundaries computed later are identical to boundaries computed
   earlier (invariant 6, scenario `BoundaryExactness`).
2. **Each block pays a fixed rate per unit of work**, `ratePerWork[b] = S_b × 1e18 / D_b`
   (fragment-wei per work unit), set in the constructor. A rig's earnings for block b are
   `baseHash × overlap × rate / 1e36` plus the same for its overclock hash up to its expiry boundary,
   where `overlap` is the intersection of the rig's unsettled interval with the block's interval.
   Nothing depends on other rigs: no reward-per-share accumulator exists (CLAUDE.md hard rule).
3. **Σ earned for block b ≤ S_b.** Σ over rigs of hash × time inside the block equals the block's total
   work, which is exactly `D_b` by construction of the boundaries (minus flooring dust), and
   `D_b × rate ≤ S_b`. Claims floor to whole fragments and `_claim` reverts if
   `minted[b] + f > supplyWhole[b]`, so the vault can never owe more than it holds (invariant 1).
   The lower bound (`≥ S_b − rigs − 2` fragments) is invariant 5.
4. **Rig settlement is idempotent.** Settling at t1 and then t2 equals settling at t2 directly
   (invariant 4, monotone earnings; differential fuzz §6 replays the same trace with different
   settlement timing). Heat decays per crossed shift; overclocks expire at the recorded boundary.
5. **Stakes are conserved.** The mine's token balances equal outstanding deposits (invariant 8);
   exit returns `amount − fee`, withdraw and emergency withdraw return `amount`.
6. **Nothing changes after close** (invariant 9): `closeX` caps every settlement interval.

## 5. Invariants (docs/05 §5.3) and where they are tested

| # | Invariant | Test |
|---|---|---|
| 1 | Σ (pending + minted) per block ≤ pool | `invariant_1_pool_never_exceeded`, fuzz `ClaimCap` |
| 2 | stored `totalHash` = Σ live rig hash | `invariant_2_3_total_hash_is_sum_of_rigs` |
| 3 | expiring buckets = live overclock hash | same |
| 4 | earnings monotone regardless of settlement timing | `invariant_4_earned_monotone`, `BoundaryExactness` |
| 5 | a found block pays its pool minus dust | `invariant_5_found_block_pays_its_pool`, `WorkedExample` |
| 6 | boundaries monotone | `invariant_6_boundaries_monotone` |
| 7 | heat ≤ heatMax, activeOc ≤ maxActiveOc | `invariant_7_heat_and_oc_bounds` |
| 8 | balances = deposits | `invariant_8_balances_match_deposits` |
| 9 | frozen after close | `invariant_9_frozen_after_close`, `ClaimThenSilence` |

Handler (`test/invariant/MineHandler.sol`): five actors, RIG and LP rigs, many rigs per actor,
upgrades, overclocks, claims, exits, withdrawals, time warps up to 2 days, guardian pause cycles
(1–12 h) with occasional cancellation and emergency withdrawals.

Campaign config: `FOUNDRY_PROFILE=campaign forge test --match-path 'test/invariant/*'` =
5,000 runs × depth 256 = 1,280,000 handler calls per invariant, 9 invariants in 8 functions,
10.24 M calls. Result recorded in `docs/BUILD-LOG.md` (Phase 4 entry). Default profile: 256 × 64;
CI: 1,024 × 128.

## 6. Differential testing against the reference

`sim/sim/mine.py` is an independent pure-Python implementation of docs/05 §5 with the contract's
integer semantics (written in Phase 2 by a separate session). `contracts/test/differential/
DiffTrace.t.sol` generates random action traces (6–45 actions, five actors, RIG and LP, wrong-owner
attempts, pre-open activity, time steps sized from `eta()` including jumps to block found, to close
and to the fail-safe deadline) against eight seasons (difficulty scales 1/64×–16×, fail-safe 14–60
days), executes them and writes trace + outcome as JSONL. `python -m sim.diff` replays every trace
and compares each action's success/revert name and result, the shift after each action, and the
final state (boundaries, close, total hash, minted, and per rig pending/claimed per block, tiers,
heat, overclocks, live hash).

Result 2026-09-04: **100,000 traces, 0 mismatches**; 72,289 traces reached close; reverts exercised:
WrongPhase 725k, RigInactive 331k, NotOwner 119k, NotFound 65k, AlreadyClaimed 50k, HeatTooHigh 5.8k,
MaxOverclocks 812, MaxTier 808, BelowMinStake 6. A 24-trace fixture is a permanent sim test.

Two reference bugs found by the harness during Phase 4 (the contract was right both times):
`claim_all` checked claimability before advancing the clock; settlement was skipped when no block
was claimable. Both fixed in the reference.

## 7. Findings from the Phase 4 review (all fixed)

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | Medium | `emergencyWithdraw` cancelled the season even if it had already closed, which would have blocked redemption for everyone after a post-close pause | Cancels only while `closeX == 0`; settles the rig first so earned fragments survive; test `test_FR_S6_emergency_withdraw_after_close_does_not_cancel` |
| F2 | Medium | `RedemptionVault.sweep` was one-shot and ignored a `false` return, so a Stock Token whose hook refused the treasury was stranded forever | Repeatable; the refusing asset is retried on the next call (spec + interface NatSpec updated) |
| F3 | Low | Burns (`burnFrom`, external call into RIG) happened before state writes in `upgradeGpu`, `upgradeCooling`, `overclock` | Checks-effects-interactions: burn last (all entry points were already `nonReentrant`; RIG has no hooks) |
| F4 | Low | Factory accepted `minStakeWeight = 0` (zero-weight spam rigs), an LP token with zero weight (unusable), and pools whose fragment-wei would not fit a rig's `uint128 earned` | Validation rules added; `ops/plan` mirrors them |
| F5 | Low | A pool small enough for `ratePerWork` to floor to 0 would deploy a season that pays nothing | Constructor reverts `InvalidParams("rate")` |
| F6 | Info | Interface return parameters shadowed getters (`fragments`, `usdc`) | Renamed |

## 8. Static analysis (slither 0.11, 76 detectors, `--exclude-informational --exclude-optimization`)

Run: `cd contracts && slither . --filter-paths "lib/|test/|script/|mocks/" --exclude-informational --exclude-optimization`.

| Detector | Where | Triage |
|---|---|---|
| reentrancy-no-eth / benign / events | `upgradeGpu`, `overclock` (burn before writes); `sweep` (`poke` before `swept`); factory `create` | F3 fixed the mine ones. `sweep` and `create` call only our own contracts and are `nonReentrant` / single-purpose. Accepted |
| unchecked-transfer | `sweep` `try s.transfer(...)` | Intentional: a refusing hook must not block other assets; F2 makes the call repeatable. Annotated |
| divide-before-multiply | `_settleCalc`, `_claim`, `upgradeGpu`, `quoteCashOut` | Each is the specified integer order (floor work, then multiply by rate; floor whole fragments, then subtract); differential fuzz confirms bit-exact agreement with the reference |
| incorrect-equality | `nowX == _deadlineX`, `bal == 0` | Exact by construction (`nowX` is clamped to the deadline); zero-balance skip |
| timestamp | phase and window checks | The design credits work by timestamp on purpose (docs/05 §9); skew is symmetric across rigs |
| uninitialized-local | `none`, `ocEndX` | Intentional sentinel values (empty array; 0 = "no expiry known") |
| missing-zero-check | constructor addresses | Set once by the factory from predicted addresses; the factory validates `rig` and `treasury`; a zero `fragments`/`vault` would make the season unusable at first call, not exploitable |
| calls-loop | `claimAll` mints, `sweep` transfers | Bounded by 4 |
| shadowing-local | interface params | F6 fixed |

No high-severity finding. Full output: run the command above (the JSON is not committed).

## 9. Known limitations (accepted, disclosed)

- **Pause does not stop the clock.** Work accrues for everyone during a pause (FR-S6 requires that
  pausing not alter rewards). Players cannot overclock or exit while paused; the grace period bounds
  how long that can last.
- **Cancellation forfeits unclaimed fragments** and sends the pool to the treasury (§3).
- **Contract wallets** must implement `onERC1155Received` to claim (fragments are ERC-1155).
- **`claim` reverts with `AlreadyClaimed` whenever there is nothing to mint**, including a block that
  never paid the rig (for example after a fail-safe close). `claimAll` skips such blocks.
- **Rounding dust.** `ratePerWork` floors; each claim floors to a whole fragment. A block can pay up to
  about one fragment per rig less than its pool; the remainder is swept.
- **Overclocks bought in the final shift never expire** (their expiry index is never reached); they
  run to close. Harmless.
- **Gas.** `activate` ≈ 265k (first rig ≈ 285k), `claimAll` ≈ 440–480k, worst-case `poke` ≈ 960k when
  all 32 shifts are crossed in one call (the keeper keeps it short). Fine for an Arbitrum-family chain.
- **`rigsOf(owner)`** is unbounded; only a view.
- **LP weight is fixed at creation** from sampled reserves; a large post-creation change in pool
  composition changes the RIG-equivalence of new LP rigs. `openTime ≥ creation + 48 h` limits the gap.
- **Difficulty is never adjusted.** A badly sized season runs short or long (docs/04 §5.2 table); the
  fail-safe closes it at `maxDurationSeconds`.

## 10. Tests, coverage, gas: how to run everything

```
bash .claude/hooks/session-start.sh                      # Foundry (tarball), pnpm, uv
bash contracts/script/check-interfaces.sh                # specs == src/interfaces
cd contracts && forge fmt --check && forge build --sizes
forge test                                               # 40 tests: unit, scenario, fuzz (512), differential (512), 8 invariants (256×64)
FOUNDRY_PROFILE=ci forge test                            # fuzz 4096, invariants 1024×128
FOUNDRY_PROFILE=campaign forge test --match-path 'test/invariant/*'          # 10.24M handler calls
DIFF_OUT=diff/traces.jsonl forge test --match-contract DiffTrace --fuzz-runs 100000
cd ../sim && uv run python -m sim.diff ../contracts/diff/traces.jsonl       # 0 mismatches expected
uv run --extra dev pytest                                # reference: 22 tests incl. the diff fixture
cd ../contracts && forge snapshot --check                # gas regressions
forge coverage --report summary --ir-minimum             # coverage (via-IR needs --ir-minimum)
uv tool install slither-analyzer && slither . --filter-paths "lib/|test/|script/|mocks/"
```

Scenario tests encode the spec's worked example to the fragment (`WorkedExample`), replay the same
progress-expressed season at 4×, 1× and 1/16× hash (`PaceReplay`, identical distributions), overclock
one second before a boundary and retroactive-vs-incremental equality (`BoundaryExactness`),
fail-safe close mid-block (`FailSafe`), and claim-then-silence (`ClaimThenSilence`).

## 11. Questions we would like the auditor to focus on

1. Any path by which `Σ minted[b]` could exceed `poolTokens[b] × fragPerToken / 1e18`.
2. Any way for one rig's settlement to depend on another rig (an accumulator sneaking back in).
3. Boundary discovery under pathological hash changes (many expiries at one shift, zero hash, hash
   changing in the same second as a boundary).
4. Pause / grace / cancel interactions with close and with the vault window.
5. The vault's behaviour with hook-restricted Stock Tokens and a stale or malicious oracle.
6. The factory's address prediction and the deployer `init` handshake.
