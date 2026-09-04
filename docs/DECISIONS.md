# Decisions

Dated log of decisions that change the spec, the design, or the build. Newest first.

## 2026-09-03 – Visual direction locked

**Decision.** Ship the direction shown in `design/launch/` (the reference-driven set), which resolves as:

- Coal-dark mine surfaces with flat, hairline-bordered cards; light shell for navigation, redeem and
  leaderboard (unchanged from the brief).
- The **cyan tick bar** is the signature device on every surface, from progress bars to apparel.
- **Fragments / the gem** are the reward language: a faceted amber gem with a cyan edge for block
  found, shards for fragments, shards-to-coin for redemption.
- The **rig room** (isometric rigs that visibly overclock) is the mine dashboard's left pane,
  with the block, rig and claim cards on the right. The flat dashboard mockup on canvas page 1 is
  the fallback if the rig room proves too expensive in Phase 3.
- Barlow Condensed 600 (500 at 48px+), IBM Plex Sans, IBM Plex Mono.

**Not taken.** The seam (direction A) and the material treatment (direction B) from
`design/directions/`. The seam stays documented as an optional later flourish; material is for
physical goods only.

**Why.** The user reviewed all five canvas pages and picked the sixteen references that became the
launch set, then approved it. Fragments and the rig room explain the product faster than the seam
did, and the reference-driven set produced layouts close enough to build from.

**Consequences.** Brief §1 and §5 updated; Phase 3 prompt points at `design/launch/` first; the
fixes listed in `design/launch/README.md` are Phase 3 tasks.

## 2026-09-03 – Phase 1 implementation decisions

- **via-IR compilation.** The settlement loop and the parameter struct exceed the legacy pipeline's
  stack. `via_ir = true` in `foundry.toml`. Gas figures are measured under via-IR.
- **Gas targets revised.** Measured (unit-suite averages/maxima): `activate` ≤ 284k, `upgradeGpu` ≤
  121k, `overclock` ≤ 146k, `claimAll` ≤ 481k (four ERC-1155 mints), `withdraw` ≤ 188k, `poke` ≤ 963k
  in the pathological 32-shifts-crossed case and ~34k when nothing crossed. docs/05 §10 targets for
  `activate` and `claimAll` were optimistic; the spec table now carries the measured numbers.
  Optimisation is a Phase 4 item, not a blocker on an Arbitrum-family chain.
- **Ownership is checked before phase** in every rig function, so a non-owner gets `NotOwner` in any
  phase. Cheaper and clearer for the UI.
- **Factory uses per-contract deployers and CREATE address prediction.** The three season contracts
  reference each other in constructors, and one factory holding all three creation codes would exceed
  the EIP-170 size limit. Each deployer's CREATE nonce is `deployments + 1`; the factory reverts if a
  prediction misses.
- **Overclocks bought in the final shift never "expire".** Their expiry index equals the total shift
  count, which is never reached; they run through close. Harmless and documented; the invariant suite
  sums expiry buckets up to and including that index.
- **Rate dust.** `ratePerWork` floors, so a fully mined block pays its pool minus up to one fragment
  per rig. Tests assert `≥ pool − rigs − 1`. The unminted remainder stays in the vault and is swept.
- **Pre-open exit charges the exit fee.** FR-R6 is written for the open phase; exiting during PreOpen
  is allowed and pays the same 3%. Fee-free pre-open withdrawal exists only for a failed funding
  (FR-S5), which cannot arise because activation is gated on `funded`.
- **`pending()` and the vault call `poke()`-equivalent simulation.** Views simulate boundaries not yet
  discovered, so the UI never needs a keeper for correctness; the vault pokes before gating.
- **Rig owners must accept ERC-1155.** A contract wallet without `onERC1155Received` cannot claim.
  Documented for the audit package; no change in v1.

## 2026-09-03 – Phase 2 simulation findings (parameters NOT changed; decision pending)

The economic simulation (`sim/`, `docs/SIM-REPORT.md`) shows everything reduces to one ratio,
ρ = pool value in RIG ÷ total hash. With the current defaults and a pool sized by the docs/04 rule
(k × expected burn), ρ lands around 0.27: total burn ≈ 3.7% of stake and the median rig burns nothing,
far below the 10–30% the docs assume. A healthy band is ρ ≈ 0.35–0.55.

Recommended by the simulation, **not applied** because they change the economics the user must own:
1. Size the pool to a target ρ ≈ 0.4 (roughly 0.55–0.6 × expected TVL value) and show pool/TVL in PreOpen.
2. `gpuCostBps` → `[300, 400, 600, 900, 1300]`; `coolCostBps` → `[200, 300, 500]`.
3. Keep overclock parameters and `shiftsPerBlock` as they are.
4. Decide `lpBonusBps` deliberately: the LP staker wins 49/50 runs at ρ ≤ 0.4 on the bonus alone.

Applied now: docs/03 §7 worked-example numbers corrected to exact integer floors (1,794,871 / 2,564,102 /
641,025); the contracts' scenario test and the Python reference both assert them within dust.
Open question Q20 added to docs/09.

## 2026-09-04 – Phase 4 hardening decisions

- **A pause after close cannot cancel the season.** `emergencyWithdraw` flips `cancelled` only while
  `closeX == 0`; after close it settles the rig, returns the deposit and leaves earned fragments
  claimable once unpaused. Before this, a guardian pause that outlived the grace period after a
  normal close would have voided everyone's redemption. FR-S6 text unchanged; docs/05 §6 table updated.
- **`RedemptionVault.sweep` is repeatable.** One-shot sweeping stranded any Stock Token whose transfer
  hook refused the treasury. Now every call moves whatever balances remain; a refusing asset is retried
  later. Interface NatSpec in `specs/contracts/IRedemptionVault.sol` updated.
- **Burns are the last effect** in `upgradeGpu`, `upgradeCooling`, `overclock` (checks-effects-
  interactions). No behaviour change; slither's reentrancy findings on those paths go away.
- **Factory validation widened**: `minStakeWeight > 0`; `lpToken` and `lpWeightPerToken` must be both
  zero or both non-zero; `poolTokens[b] × fragPerToken ≤ uint128 max`; the mine constructor rejects a
  `ratePerWork` of zero. `ops/plan` mirrors the rules with the same reason strings.
- **Reference (`sim/`) mirrors the contract's claim semantics exactly**: `claim` settles then reverts
  `AlreadyClaimed` when nothing is mintable; `claimAll` settles once, then mints every found block, all
  or nothing. Found by the differential harness (two reference-side bugs; the contract was right).
- **Interface return names**: `claim`/`claimAll` return `minted`, `cashOut`/`quoteCashOut` return
  `usdcOut` (were shadowing the `fragments()` / `usdc()` getters). Selectors unchanged.
- **forge scripts are the deployment path.** `forge script --broadcast` works in the remote sandbox
  with `NO_PROXY=127.0.0.1,localhost`; the earlier "hangs" were the agent proxy. `ops/deploy-demo.ts`
  stays for the app's Playwright setup only.
- **`--verify` uses Blockscout flags on the CLI**, not an `[etherscan]` block, until the explorer is
  known (docs/01 §10.1).
- **Not changed, logged as accepted**: pause does not stop the clock; cancellation forfeits unclaimed
  fragments to the treasury; `claim` of nothing reverts `AlreadyClaimed`. See `docs/AUDIT-PACKAGE.md`
  §9.
