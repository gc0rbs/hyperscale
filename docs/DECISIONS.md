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

## 2026-09-04 – Seasons are short; the cap is a normal ending (user decision)

Direction from the user: a season should not last more than about six hours and must be able to open
the moment it is created. Reviewed what the 48-hour minimum pre-open and the 14-day fail-safe floor
actually protected (see the discussion recorded in `docs/AUDIT-PACKAGE.md` §9 and the PRD risk table):
neither is load-bearing for the accounting. Changes:

- **No minimum pre-open.** `SeasonFactory` rejects only an `openTime` in the past. Pre-open length is
  an ops choice per season, zero allowed (Q13 closed). NFR-6 reworded: publish params and hash before
  open, as early as the launch plan allows.
- **The cap is a hard end, not a fail-safe.** `maxDuration` floor lowered from 14 days to 1 hour;
  default per season 2× the planned pace (6h for a 3h plan). A season ended by the cap pays what was
  mined; the unmined remainder is swept and funds the next season (ops policy, no contract change).
  FR-S7, FR-A6 and the CLAUDE.md hard rule reworded: rewards never accrue by time, but the cap is a
  normal ending and is shown from the start as the latest possible end (Q9 closed).
- **Pay-per-work kept** over "distribute the whole pool by share of work when capped": the latter would
  reintroduce dependence between rigs (dilution, last-minute whales) and a rewrite of the audited core.
- **Defaults**: `specs/params/season-default.json` plans 3h at 10M hash (difficulty 1.08e11), cap
  21,600 s, pause grace 1,800 s (was 6h). The docs/03 §7 worked example keeps its 24h numbers as an
  example; tests that reproduce it pass that difficulty explicitly.
- **LP weight reasoning corrected**: a longer gap between the reserve sample and open makes the frozen
  weight staler, not safer; the 24h sampled average is the protection.
- **Tooling**: `ops plan --max-duration`, `--open-time` default `+600`; demo deployer opens two minutes
  after deploy (`OPEN_DELAY=0`), cap via `MAX_DURATION`; Playwright uses a 10-minute pre-open.
- **App**: the cap time is shown in the mine header; the closed screen distinguishes "time's up" from
  "block 4 found" and says the remainder rolls forward.
- **Known consequence**: with a 2× cap and turnout uncertainty σ≈0.3, about 1–2% of seasons end at the
  cap (sim `test_sizing_recommendation`); block 4 holds 40% of the value, so ops should keep the cap
  ≥ 2× planned or flatten the value shares (docs/04 §5.2).

## 2026-09-04 – Type and art direction for the build (user decision)

- **Display face is Humane** (user-supplied, `app/src/fonts/humane/`), replacing Barlow Condensed;
  used only from 36px up, uppercase, weights 600/700. **Body is Readex Pro** (Google Fonts build,
  self-hosted). IBM Plex Mono stays for numbers. Tokens, brief §3 and the app updated.
- **Boards are references, not assets.** Each component is treated on its own: icons and the logo are
  inline SVG; the rig room draws each machine from its state in SVG; one purpose-made render was
  generated (Higgsfield, Nano Banana Pro, with board 66 as the style reference) for the landing hero.
- Licence check for Humane is the user's item before launch.

## 2026-09-04 – $RIG launches on Pons; RIG-only staking (user decisions)

- **$RIG is a Pons-launched token** on Robinhood Chain (chain 4663): plain ERC-20, fixed 1B supply,
  18 decimals, no burn function, graduating to a Uniswap v3 RIG/WETH pool whose position is locked by
  the Pons locker. Verified from the Pons docs and Robinhood Chain network details; PRD §10 items 1, 3
  and 5 updated.
- **Burns are dead-address transfers.** `SeasonMine._burn` now does `safeTransferFrom(player,
  0x…dEaD)` instead of `burnFrom`. Same economic effect (unrecoverable, visible on chain); nominal
  supply stays 1B. CLAUDE.md hard rule reworded; docs/04 and 05 updated; `PonsToken.t.sol` runs a
  season against a burn-less ERC-20. `RIG.sol` is now a dev/test token only.
- **No LP staking in v1** (Q3 closed). The user does not need the liquidity incentive. The mine's LP
  path stays (audited, off by `lpToken = 0`); the app hides the LP option when the season has none. A
  full-range Uniswap v3 wrapper token plus zap is the documented v1.1 route if that changes.
- **No cap on rig count.** Pay, prices and overclocks are all linear in stake, so splitting gains
  nothing; the minimum stake per rig is the anti-spam control and is sized per season.
- Chain profile `ops/chains/robinhood.json` carries the verified chain, explorer, WETH, Uniswap v3 and
  Pons addresses; season addresses stay zero until launch and Q1.

## 2026-09-04 – Season-1 Stock Tokens and what Robinhood's tokens actually are (user decision)

- **Set: NVDA, MU, SNDK, QQQ** (AI/GPU infrastructure theme; QQQ as the index finale). Canonical
  addresses on chain 4663 from Robinhood's asset API are in `specs/params/season-default.json` and
  `ops/chains/robinhood.json`. Value shares stay 15/20/25/40; `ops plan --pool-usd` converts them to
  token amounts at live mid prices (2026-09-04: NVDA $230, MU $999, SNDK $1,719, QQQ $717).
- **Robinhood Stock Tokens are plain ERC-20s** (18 decimals, ERC-8056 multiplier, no hook). The
  allowlist risk that shaped the vault design is gone; the legal restriction (no U.S., CA, UK, CH
  persons) becomes a front-end geo-fence plus terms. Mainnet uses `OpenEligibility`. Tests keep the
  stricter allowlisted mock. Q1 closed.
- **Cash-out oracle is Chainlink.** Every token has a feed with the multiplier baked in;
  `ChainlinkOracle` adapts it (immutable stock → feed map, rescaled to 1e8, non-positive answers read
  as stale). The quote token is **USDG**, so the vault now reads the quote token's `decimals()` at
  construction instead of assuming six.
- App ticker constants and mocks use the new symbols; the docs/03 worked example keeps its numbers
  under the NVDA name.
- Still to fill before the testnet season: the four Chainlink feed addresses, USDG decimals check,
  testnet (46630) RPC and faucet.

## 2026-09-04 – Feed facts and the cash-out staleness cap

- Chainlink feeds for NVDA, MU, SNDK, QQQ (and SPY, ETH/USD, USDG/USD) on chain 4663 recorded in
  `ops/chains/robinhood.json` from Chainlink's reference data; NVDA verified live. They are 8-decimal,
  24 h heartbeat, 0.5% deviation feeds.
- **Vault staleness cap raised from 1 h to 26 h.** With a 24 h heartbeat a stable price legitimately
  carries a day-old timestamp; a 1 h cap would have refused most cash-outs. 26 h = heartbeat + margin;
  the 0.5% deviation trigger bounds the price error a stale-but-fresh timestamp can hide. Over a
  weekend the feed goes quiet, cash-out pauses, in-kind redemption is unaffected.
- USDG confirmed 6 decimals on chain; testnet RPC confirmed at chain id 46630.

## 2026-09-04 – Wallet, chain and geo-fence wiring for launch

- **Chains in the app are fixed definitions**, not env-derived: mainnet 4663 (`robinhood`, Blockscout
  explorer) and testnet 46630 (`robinhoodTestnet`), Anvil for dev. `NEXT_PUBLIC_CHAIN_ID` picks one and
  `NEXT_PUBLIC_RPC_URL` overrides the RPC. A connected wallet on another chain sees a "Switch network"
  button in the nav; writes are not attempted until it matches.
- **WalletConnect is optional**: the connector is added only when `NEXT_PUBLIC_WC_PROJECT_ID` is set,
  so a deploy without a WalletConnect Cloud project still works with injected wallets.
- **Geo-fence in middleware** (docs/07 §1, §5): requests whose edge country header is US, CA, GB or
  CH are rewritten to `/restricted` with HTTP 451. On by default in production only;
  `NEXT_PUBLIC_GEOFENCE=0/1` overrides, `GEOFENCE_COUNTRIES` lists the countries. This is the legal
  control that replaced on-chain eligibility once Stock Tokens turned out to have no transfer hook; it
  is a best-effort control and the terms carry the eligibility clause as well.
- `/how-it-works` (FR-A6 reference the terms point at) and `/terms` (draft structured per docs/07 §5,
  wording for counsel) added; the landing footer links both and carries the region notice.
- **Adapters get their own deploy step** (`DeployAdapters.s.sol`, `ops deploy-adapters`): deploys
  `OpenEligibility` and `ChainlinkOracle` from the chain profile's stock and feed maps, checks every
  feed answers, writes `deployments/<chainId>-adapters.json`; `ops plan` falls back to that file when
  the profile leaves `oracle` / `eligibility` at zero. Run once per chain, not per season.

## 2026-09-04 – Hosting the always-on services

- **One compose stack per season** (`docker-compose.yml`: Postgres, Ponder indexer, keeper, watcher),
  built from `ops/Dockerfile` and `indexer/Dockerfile`. The ops image compiles the contracts with the
  pinned Foundry so ABIs match the deployed bytecode; season addresses are mounted from
  `contracts/deployments/<chainId>.json`; keys come from the environment only (`.env`, git-ignored).
- **Watcher alerts go to a webhook** (`ALERT_WEBHOOK_URL`, Slack/Discord JSON), warn and page levels by
  default, one send per identical message per `ALERT_REPEAT_SECONDS` (15 min) so a standing pause pages
  once per window, not every tick. Logging is unchanged.
- **CreateSeason records the creation block** (`block` in the deployment JSON) and the indexer starts
  there by default; indexing a mainnet season from block 0 was the alternative and is wasteful.
  The keeper is restarted only on failure because it exits by itself at close.

## 2026-09-04 – Share card and notifications

- **Share card is rendered from live state** (`app/src/app/opengraph-image.tsx`, `next/og`, Humane
  Bold): a link pasted mid-season shows which block is mining and the tick bar, with a static
  fallback when the RPC does not answer within 1.5 s. Twitter card reuses it. `NEXT_PUBLIC_APP_URL`
  is the metadata base.
- **Notifications are local browser notifications, opt-in**, not web push: they fire while a Stock
  Miner tab is open, which covers a ≤6 h season without a push server or a stored subscription. Block
  found, mine closed, and (long haul only) shift start; the first observation after load is silent.
  Web push stays a v1.1 item if seasons ever run for days again.
- Block-found banner gets a Share button (Web Share on mobile, clipboard elsewhere).
- CI builds both Docker images (no push) so a broken Dockerfile fails the PR, not the launch night.

## 2026-09-04 – Humane font licence (user provided the EULA)

- Humane V.2.0 is freeware, free for personal and commercial use; the files may not be modified
  without the designer's written permission; only the right to use is granted. Transcribed in
  `app/src/fonts/humane/LICENSE.md`.
- Consequences: the `.ttf` files are served unmodified (no WOFF2 conversion, no subsetting; both
  `next/font/local` and the share card use the raw files), the designer is credited in the landing
  footer, and the repository must stay private while the files are committed (or the files move to a
  private asset bucket before the repo goes public). The "Humane licence check" launch item is closed.

## 2026-09-04 – Launch responsibilities (user decision)

- **The client launches $RIG on Pons**, runs the treasury as a **single operator key (no multisig)**,
  and **commissions the audit themselves**. `docs/AUDIT-PACKAGE.md` is the hand-off to their auditor.
- Consequence of a single-key treasury: that key holds the only live admin power (pause) and receives
  fees and sweeps. The runbook now says to keep it on a hardware wallet distinct from the deployer
  and keeper keys. A compromised treasury key can pause a season; if the pause outlives the grace
  period, players cancel it and recover deposits, so the blast radius is one season, not funds. Q17
  closed.

## 2026-09-04 – Public docs are a GitBook synced from the repo

- Player docs live in `gitbook/` and sync through GitBook Git Sync, so they version with the code
  and a parameter change and its doc change land in one commit. Internal specs stay in `docs/`.
- The safety section states which guarantees are enforced by code and which depend on people
  (operator sizing, the pause key, Chainlink, Robinhood, the geo-fence), and reproduces the known
  limitations from the audit package verbatim in plain language. Nothing is promised that the
  contracts do not enforce.
