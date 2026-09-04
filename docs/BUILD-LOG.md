# Build log

Hand-off notes between build sessions. Newest entry first. Each session appends a plan at start and a
"what shipped / what's next / known gaps" entry at end.

## 2026-09-03 – Phase 0: scaffold (plan)

Goal: monorepo skeleton where every package's `check` runs green here and in CI, so phases 1–3 can
start coding immediately.

Plan:
1. Install Foundry (`foundryup`) and confirm `uv`.
2. Root: pnpm workspace, `pnpm -r check`, `.gitignore`, `.nvmrc`, `.editorconfig`.
3. `contracts/`: foundry.toml, forge-std + OpenZeppelin 5 as submodules, remappings, interfaces copied
   from `specs/contracts/` into `src/interfaces/` with a byte-compare drift check in `check`, one
   trivial test.
4. `sim/`: uv project, `sim/` package stub, one passing test, `check` = ruff + pytest.
5. `app/`: Next.js App Router + TypeScript + Tailwind + wagmi/viem, tokens imported from
   `specs/design/tokens.css`, one passing vitest, `check` = lint + typecheck + test.
6. `indexer/`: Ponder stub with `check` = typecheck. `ops/`: TypeScript scripts stub with a test.
7. `.github/workflows/ci.yml` running all of it; `.claude/settings.json` SessionStart hook that
   installs Foundry and runs `pnpm install` when needed.
8. README "Developing" section; this log's closing entry.

## 2026-09-03 – Phase 0: scaffold (shipped)

**What shipped**
- pnpm workspace with `contracts/`, `sim/`, `app/`, `indexer/`, `ops/`; `pnpm -r check` green locally
  (contracts: interface drift check + fmt + build + 2 tests; sim: ruff + 2 pytest; app: eslint + tsc +
  2 vitest; indexer: tsc; ops: tsc + 3 vitest).
- `contracts/`: Foundry 1.5.1, solc 0.8.28, forge-std v1.9.6 and OpenZeppelin v5.2.0 as submodules,
  `fs_permissions` for `../specs`, interfaces copied from `specs/contracts/` with
  `script/check-interfaces.sh` byte-comparing them, `.gas-snapshot` baseline, `ci` profile with
  heavier fuzz/invariant runs.
- `sim/`: uv project, `sim.params.load_params` validating a season JSON (the first real code), tests.
- `app/`: Next.js 15 / React 19 / wagmi / viem / Tailwind. `specs/design/tokens.css` is imported by
  `globals.css` and every token is exposed through the Tailwind theme (`bg-mine-bg`, `text-ember`,
  `font-display`, …). `src/lib/format.ts` has the hash and ETA formatters from the brief, tested.
- `ops/`: `sizing.ts` implements docs/04 §5.2 difficulty sizing with a test pinned to the
  season-default numbers; `plan.ts` prints a sizing from a params file.
- `indexer/`: type-only sketch of the entities; real Ponder schema waits for the ABI.
- `.github/workflows/ci.yml`: three jobs (contracts, ts, sim). `.claude/settings.json` SessionStart
  hook (`.claude/hooks/session-start.sh`) installs Foundry from the release tarball (the GitHub API is
  blocked through the proxy, so `foundryup` alone fails), inits submodules, `pnpm install`, `uv sync`.
- README "Developing" section.

**Verified commands** (this session): `pnpm -r check` → exit 0; `cd contracts && forge test` → 2 passed;
`cd sim && uv run --extra dev pytest -q` → 2 passed; `bash contracts/script/check-interfaces.sh` → ok.

**Known gaps**
- `forge fmt` reformatted the spec interfaces; `specs/contracts/*.sol` now carry forge-fmt style so
  the drift check passes. Keep them fmt-clean when editing.
- The session-start hook has not been exercised by a fresh session yet; first run of phase 1 should
  confirm it.
- CI has never run (no PR yet). The `forge snapshot --check` step will need a fresh snapshot once real
  contracts exist.
- App is a one-page placeholder; no wallet provider wiring yet (phase 3).

**Next**
- Phase 1 (contracts) and Phase 2 (sim) can start in parallel now, from the prompts in
  `docs/10-BUILD-PLAN.md`. Phase 1's first move: write the pace-replay and boundary-exactness tests
  against `ISeasonMine` and watch them fail.

## 2026-09-03 – Phase 1: contracts (shipped)

**What shipped** (`contracts/`)
- `src/tokens/RIG.sol`, `src/SeasonMine.sol`, `src/StockFragments.sol`, `src/RedemptionVault.sol`,
  `src/SeasonFactory.sol` + `src/factory/{Deployers,CreateAddress}.sol`, adapters
  (`OpenEligibility`, `AllowlistEligibility`), mocks (stock token with allowlist hook, ERC-20, oracle).
- `script/DeployDemo.s.sol`: funded demo season on Anvil, addresses to `deployments/anvil.json`,
  first five Anvil accounts funded and allowlisted. Verified end to end against a local Anvil.
- Tests (37 + 6 invariants, all green): unit (`Mine.t.sol` FR-tagged, `Gating.t.sol`, `Vault.t.sol`),
  scenario (`WorkedExample` = docs/03 §7 to within 0.5% and exact burn; `PaceReplay` at 4×, 1×, 1/16×
  hash (G5); `BoundaryExactness` retroactive == incremental, overclock 1s before a boundary;
  `FailSafe` mid-block close), fuzz (`ClaimCap` 513 runs), invariants (§5.3 #1,2,3,4,6,7,8; 256 runs ×
  depth 64 = 16,384 calls each). Interface drift check passes; `forge fmt --check` clean.
- `.gas-snapshot` refreshed; measured gas recorded in docs/05 §10 and DECISIONS.

**Deviations / decisions**: see `docs/DECISIONS.md` 2026-09-03 Phase 1 (via-IR, gas targets, deployer
pattern, final-shift overclocks, rate dust, pre-open exit fee, ERC-1155 receiver).

**Known gaps**
- Invariant #5 (Σ work in a found block == difficulty − dust) and #9 (no earned change after close) are
  covered only by scenarios, not by the invariant handler.
- No differential fuzz against the Python reference yet (Phase 4, once `sim/` lands).
- Gas is above the original targets; no optimisation pass yet.
- `AllowlistEligibility` is owner-mutable by design (issuer KYC lists change); it lives outside the
  immutable season set.

**Hand-off for Phase 3**
- ABI: `contracts/out/SeasonMine.sol/SeasonMine.json` (and StockFragments, RedemptionVault, RIG,
  MockERC20, MockStockToken, AllowlistEligibility, MockPriceOracle, SeasonFactory).
- Demo season: `anvil --block-time 1` then
  `forge script script/DeployDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast`
  (env `PACE_SECONDS`, `DEMO_HASH`, `OPEN_DELAY`). Time-warp with `cast rpc evm_increaseTime`.
- Reads the UI needs in one multicall: `shift, workInShift, lastX, totalHash, closeX, progress(),
  eta(), ratePerWork(b), blockEndX(b), shiftEndX(k)`, per rig `rigs(id), pending(id,b), rigHash(id)`.

## 2026-09-03 – Phase 2: simulation (shipped, by a parallel agent)

**What shipped** (`sim/`, `docs/SIM-REPORT.md`): `sim.mine` pure-Python reference of spec §5 with the
contract's integer semantics; `python -m sim.replay trace.json` differential oracle; eight strategy
agents; `python -m sim.run` Monte-Carlo runner (1,000 players ≈ 0.2 s); `python -m sim.sizing`
difficulty sizing with duration distribution and fail-safe flags. 21 tests (hypothesis stateful machine
over all nine §5.3 invariants, worked example to the fragment, pace replay bit-identical at five paces).

**Findings**: everything reduces to ρ = pool value in RIG ÷ total hash; defaults land at ρ ≈ 0.27 where
burn is ~3.7% and the median rig burns nothing; healthy band ρ ≈ 0.35–0.55. Parameter changes are
recommended but **not applied** (DECISIONS 2026-09-03, open question Q20). docs/03 §7 numbers corrected
to exact floors.

**Next**: Phase 4 wires `sim.replay` as the differential-fuzz oracle for the contracts.

## 2026-09-03 – Phase 3: app (shipped)

**What shipped** (`app/`, `ops/`, `indexer/`, `contracts/deployments/`)
- Next.js 15 App Router with wagmi/viem reading the chain directly. Routes: `/` landing, `/mine`
  (live mine: block card with work progress and ETA, rig room, hash stream, rig cards with GPU /
  cooling / overclock purchase sheets, pre-open / long-haul / closed states, found banner), `/mine/new`
  (activate with RIG or LP, approvals inline), `/claim` (claim-all and withdraw per rig), `/redeem`
  (eligibility check, redeem per block), `/leaderboard` (first 200 rigs by hash), `/seasons`,
  `/api/frag/[id]` metadata. Design tokens from `specs/design/tokens.css` feed the Tailwind theme;
  the layout follows `design/launch` and `design/artboards`.
- `src/lib/mine-math.ts`: TypeScript port of §5 (`advance`, `settle`, `pending`, `eta`,
  `fragmentsPerSecond`, `blockProgressBps`). Parity test (`pnpm parity`) checks `pending()` and
  `eta()` against the contract on Anvil over random states; passes.
- Chain-anchored clock: UI time = wall clock + offset to the latest block timestamp, so time-warped
  Anvil and real chains render the same.
- Dev wallet: wagmi mock connector with the five Anvil accounts, "Acting as" selector persisted in
  localStorage, enabled only with `NEXT_PUBLIC_DEV_ACCOUNTS=1`.
- `ops/deploy-demo.ts` (viem; `forge script --broadcast` hangs in the remote sandbox), writes
  `contracts/deployments/<chainId>.json` which the app reads server-side. `ops/sync-abi.ts` copies
  the 12 ABIs into `app/src/abi`. `ops/keeper.ts` pokes the mine when a shift or the fail-safe is due;
  `ops/watch.ts` prints alerts.
- Ponder indexer (`indexer/`) with a Hono API: `/leaderboard`, `/rigs/:owner`, `/shifts`, `/season`.
  Optional; the app does not depend on it.
- Playwright season (`app/e2e/season.spec.ts`): starts Anvil, deploys, activates pre-open, buys a GPU,
  opens, overclocks, warps to a block, claims, warps to close, withdraws, redeems, and checks balances
  against the vault. Green at paces 60, 300 and 3600 seconds per block (E2E_PACE).
- `pnpm -r check` green: app (7 unit tests, lint, typecheck), ops (sizing test), indexer (codegen +
  tsc), contracts (38 tests + 6 invariants), sim (21 tests).

**Deviations**: none in mechanics. The UI reads `progress()`/`eta()` views for anything that must be
current without a poke; stored `shift`/`closeX` are only used by the estimator after `advance`.

**Known gaps**
- No real wallet has been tested (only injected + mock connectors). Robinhood Chain ids and RPC are
  placeholders in `src/lib/wagmi.ts`.
- Leaderboard reads the first 200 rigs; the indexer API is the path for larger seasons.
- No Lighthouse / accessibility pass; mobile layout is responsive but only checked in Chromium.

**Next**: Phase 4 (hardening) starts now on the same branch.

## 2026-09-04 – Phase 4: hardening (plan)

Inputs read: CLAUDE.md, docs/05 §9, docs/07, docs/08 §3–4, DECISIONS, the last three BUILD-LOG entries.
No `security-review` skill is available in this account; the review is done by hand plus slither
(installed via `uv tool install slither-analyzer`). `forge script --broadcast` works in the remote
sandbox when `NO_PROXY=127.0.0.1,localhost` is set (the earlier "hang" was the agent proxy swallowing
localhost RPC), so forge scripts are the canonical deploy path and ops scripts wrap them.

Plan, in order:
1. Manual review of `SeasonMine`, `RedemptionVault`, `SeasonFactory`, `StockFragments`, deployers;
   slither triage. Fix what is real, log the rest in `docs/AUDIT-PACKAGE.md`.
2. Differential fuzz: a Foundry fuzz test builds random action traces, runs them against
   `SeasonMine`, and appends trace + outcome as JSONL; `python -m sim.diff` replays every line through
   the Python reference and diffs state, action results and revert names. Target ≥ 100k traces.
3. Invariant campaign: widen the handler (pause/unpause cycles, emergency withdraw, cancellation),
   add invariants #5 (found block pays its pool minus dust) and #9 (nothing changes after close),
   add a `campaign` profile and run ≥ 10M handler calls.
4. Deployment: `DeployFactory.s.sol`, `CreateSeason.s.sol` (params from a resolved season JSON),
   chain profiles (`anvil`, `robinhood-testnet` placeholders), `ops/plan.ts` (24h sampled RIG-per-LP,
   difficulty sizing, factory-rule validation), `ops/fund.ts`, `ops/sweep.ts`.
5. Dry run: Anvil "long" season (~1 week planned pace) driven by the scripts and keeper only, warped
   to close, swept. Written up as `docs/RUNBOOK.md`.
6. `docs/AUDIT-PACKAGE.md`, docs sync, DECISIONS entries, final BUILD-LOG entry with the docs/08 §4
   release checklist.

## 2026-09-04 – Phase 4: hardening (shipped)

**Security pass** (`docs/AUDIT-PACKAGE.md` §7–§8): six findings, all fixed in the same commits as
their tests. Two medium: `emergencyWithdraw` could cancel an already-closed season (blocking every
redemption); `sweep` was one-shot and stranded any Stock Token whose hook refused the treasury. Three
low (burn ordering, factory validation gaps, zero-rate seasons), one informational (shadowing).
slither 0.11: 30 results after the fixes, every one triaged; none high. slither runs in CI with
`--fail-high`.

**Differential fuzz**: `contracts/test/differential/DiffTrace.t.sol` + `python -m sim.diff`.
100,000 random traces across eight season profiles, **0 mismatches** (action results, revert names,
boundaries, close, per-rig balances). The harness found two bugs in the *reference* (`claim_all`
ordering, settlement timing), both fixed; a 24-trace fixture is a permanent sim test. 587 s to
generate, 32 s to replay.

**Invariant campaign**: handler widened with pause cycles, cancellation and emergency withdrawals;
invariants 5 (found block pays its pool minus dust) and 9 (frozen after close) added, so all nine
§5.3 invariants are now in the handler suite. Campaign profile 5,000 runs × depth 256 × 8 functions =
10.24 M handler calls: **8 of 8 passed**, 2,660 s wall (13,927 s CPU), ~2% of calls reverted as
expected (guards on paused or closed seasons).

**Deployment**: `script/DeployFactory.s.sol`, `script/CreateSeason.s.sol` (reads the resolved season
JSON; dry run without `--broadcast`); `ops plan` (24 h sampled LP weight, difficulty sizing, factory
rules mirrored with the same reason strings, params hash), `fund`, `guardian`, `sweep`, `play` (dev);
chain profiles with a `robinhood-testnet` placeholder set and a README mapping each blank to the PRD
§10 assumption it depends on. `forge script --broadcast` works in the sandbox with `NO_PROXY` set.

**Dry run** (`docs/RUNBOOK.md` §9, executed): factory → plan (one-week pace at 5 M hash) → create →
fund → three rigs (RIG, LP, upgraded) → open → keeper-driven shifts → overclocks → block 0 found and
claimed → close → claims, withdrawals, in-kind redemption → sweep refused while the window was open,
moved everything after it. Pause/unpause and a full cancellation rehearsed on a second season; the
watcher paged on both.

**Docs synced**: 05 (§6 emergency row, §9 validation and CEI rows, sweep), 06 §6 (ops tooling), 08 §3
(differential fuzz, static analysis, dry runs), README, CLAUDE.md, DECISIONS (nine entries),
RUNBOOK, AUDIT-PACKAGE. Gas snapshot made deterministic (`--no-match-test 'testFuzz|invariant_'`).

**Checks at hand-off**: `forge test` 40 tests + 8 invariants green; `forge snapshot --check` clean;
interfaces match specs; sim 22 tests + ruff clean; app 6 unit tests, lint, typecheck, Playwright
season at pace 300, parity vs Anvil; indexer codegen + tsc; ops 6 tests.

**Known gaps**
- No gas optimisation pass (accepted; Arbitrum-family chain).
- Line coverage of the deterministic suite is 84% (audit package §10); the factory's validation
  branches and the RLP nonce branches are the bulk of what is uncovered on the Solidity side.
- The `robinhood-testnet` profile is placeholders; the testnet season itself needs the Q1/Q3
  decisions and the PRD §10 assumptions verified (`ops/chains/README.md`).
- Simulation-recommended parameter changes (Q20) still not applied.

**Release-readiness checklist (docs/08 §4)**

| Item | Status |
|---|---|
| Params JSON published with hash ≥ 48h before `openTime` | tooling ready (`ops plan` prints the hash; `CreateSeason` records it); needs the real season |
| `SeasonFactory.create` executed and contracts verified on explorer | scripts ready with dry run; verification flags documented; needs the explorer (PRD §10.1) |
| Vault funded; `phase() == PreOpen`; app shows pool and USD value | `ops fund` asserts PreOpen; app shows pool; done in dry run |
| Eligibility adapter tested with a known-eligible and an ineligible wallet | `AllowlistEligibility` tested in unit tests and dry run; the real adapter depends on Q1 |
| Oracle feeds live and within staleness bounds | vault enforces ≤ 1h; real adapter depends on PRD §10.5 |
| Difficulty sized from PreOpen TVL preview and simulation; pace and fail-safe published | `ops plan` computes and prints both; sim report available; needs the real inputs |
| Keeper running; alerting running; on-call rota sized to the estimated duration | keeper and watcher done and exercised; `alert()` must be wired to the on-call channel |
| Terms, "how rewards work" page, geo-fence live | not in this repo's scope (docs/07) |
| Pause key holders and procedure documented; cancellation rehearsal done | procedure in RUNBOOK §7; rehearsal done on Anvil; testnet rehearsal pending the testnet |
| Post-close plan: withdraw comms, redemption reminders, sweep date | RUNBOOK §8; `ops sweep` done |

**Next**: decide Q1, Q3 (and Q20), fill `ops/chains/robinhood-testnet.json`, run RUNBOOK §1–§8 on
the testnet, hand `docs/AUDIT-PACKAGE.md` to the auditor.

## 2026-09-04 – Short seasons: no minimum pre-open, cap as a normal ending

User decision (DECISIONS 2026-09-04, "Seasons are short"). Shipped in one pass:
- `SeasonFactory`: `openTime ≥ now` (was ≥ now + 48h), `maxDuration ≥ 1h` (was 14 days). Spec NatSpec,
  `ops/plan` validation and tests updated; new scenario `CappedSeason.t.sol` (6h season opening at
  creation, 1M hash instead of 5M, closed by the cap after block 1 + 4/5 of block 2, fragments claimed
  and redeemed, remainder swept and funding season 2). Note for test authors: via-IR may reuse a
  `TIMESTAMP` read across `vm.warp` within one function; use `vm.getBlockTimestamp()`.
- Defaults: 3h plan / 6h cap / 30 min pause grace. Sim sizing defaults and tests follow; the docs/03
  worked example keeps 24h numbers via explicit difficulty.
- Ops: `plan --max-duration`, `--open-time +600` default; demo deployer `OPEN_DELAY=0` +2 min,
  `MAX_DURATION` env; e2e uses a 10-minute pre-open. Dry-run commands in the runbook updated.
- App: cap time in the mine header; closed screen for capped seasons.
- Docs: CLAUDE.md hard rule, PRD (FR-S2, FR-S7, FR-A6, NFR-6, risks, metrics), 02, 03, 04 §5.1–5.2, §6,
  params table, 05, 06, 07, 08, 09 (Q9, Q13, Q14), GLOSSARY, README, RUNBOOK, AUDIT-PACKAGE.
- Checks: forge 43 tests + 8 invariants, snapshot regenerated, interfaces match; sim 22 tests; ops 6;
  app check, Playwright season (pace 300), parity.

## 2026-09-04 – Pons compatibility

- Burn = transfer to `0x…dEaD` (`SeasonMine.BURN_ADDRESS`); `ERC20Burnable` dependency dropped.
  New `test/unit/PonsToken.t.sol`: full season on a burn-less ERC-20, LP disabled, spend lands at the
  dead address, mine holds deposits only. Worked-example test measures burn at the dead address.
  Gas snapshot regenerated.
- App: the activate page shows the LP option only when `lpWeightPerToken > 0`.
- `ops/chains/robinhood.json` (mainnet 4663) with verified external addresses; foundry rpc endpoint
  `robinhood`; chains README rewritten for the Pons token.
- Docs: CLAUDE.md, PRD §10/§11, 04, 05, 09 (Q3 closed), AUDIT-PACKAGE §1–2, DECISIONS.
- Still open before a testnet season: Q1 (Stock Tokens and their hooks), the oracle for cash-out,
  whether a Robinhood Chain testnet with faucets exists.

## 2026-09-04 – Season-1 stock set and Robinhood token integration

- `ChainlinkOracle` adapter + `MockAggregator` + unit tests (rescaling, negative answers, validation).
- `RedemptionVault` reads the quote token's `decimals()` at construction (USDG on Robinhood Chain).
- Symbols NVDA / MU / SNDK / QQQ across params, mocks, tests, app; real token addresses in the
  template and the mainnet chain profile; USDG address; testnet chain id 46630.
- `ops plan --pool-usd [--prices]`: pool sizing by value share at live Robinhood prices
  (`sizePoolByValue`, tested).
- Docs: PRD §10 (items 2, 4, 5 verified) and risks, 04 §5.1, 05, 07 risk register, 09 (Q1 closed),
  AUDIT-PACKAGE §1–2, RUNBOOK, chains README, DECISIONS.
- Checks: forge 47 tests green, snapshot regenerated, interfaces match; ops 7 tests; app check green.
- Feeds, USDG decimals and testnet RPC filled from chain and Chainlink data; vault staleness cap 26 h
  (24 h heartbeat + margin); Vault test updated.

## 2026-09-04 – Launch wiring: chains, wallets, geo-fence, adapters

- App: `wagmi.ts` defines Robinhood Chain mainnet/testnet, `chainFor()`, optional WalletConnect
  connector; nav shows "Switch network" when the wallet's chain differs from the deployment's
  (`data-testid="switch-network"`); `middleware.ts` geo-fence → `/restricted` (451); `/how-it-works`,
  `/terms`; landing footer links; `.env.example` for a production deploy. `*.tsbuildinfo` untracked.
- Contracts: `script/DeployAdapters.s.sol` (OpenEligibility + ChainlinkOracle, feed sanity loop,
  writes `deployments/<chainId>-adapters.json`).
- Ops: `deploy-adapters` command builds STOCKS/FEEDS from the chain profile in block order;
  `loadAdapters` in `lib/season.ts`; `plan` prefers profile → adapters file → factory file for oracle
  and eligibility (zero addresses skipped).
- Docs: RUNBOOK §1b (adapters), §10 (app deployment), §11 (release checklist); DECISIONS.
- What's next: hosting for app, Ponder indexer and keeper/watcher; share cards; mobile/a11y QA;
  testnet season on 46630 with mocks; external audit; Pons launch → treasury multisig → adapters →
  season. Counsel review of the terms and the Humane licence check are the user's items.
- Known gaps: ERC-8056 `balanceOfUI` display for Stock Token balances not implemented; testnet
  explorer and faucet unconfirmed; geo-fence relies on the host's country header.

## 2026-09-04 – Hosting: compose stack, alert webhook, indexer start block

- `docker-compose.yml`, `.env.example`, `.dockerignore`, `ops/Dockerfile` (Foundry build stage + Node
  runtime, entrypoint `pnpm --filter @stock-miner/ops`), `indexer/Dockerfile`.
- `ops watch`: `ALERT_WEBHOOK_URL` / `ALERT_MIN_LEVEL` / `ALERT_REPEAT_SECONDS`; verified on Anvil
  with a local receiver (info forwarded at `info`, suppressed at `warn`).
- `CreateSeason.s.sol` and `deploy-demo` write `block`; `ponder.config.ts` uses it as the default
  start block (empty `START_BLOCK` means unset).
- RUNBOOK §5 (hosting, alerts), indexer README, DECISIONS.
- Checks: forge build, ops 7 tests, indexer check, `docker compose config`. Image builds are not
  verified here (no Docker daemon in the session); first `docker compose up --build` is on the host.

## 2026-09-04 – Share card, notifications, CI images

- `opengraph-image.tsx` + `twitter-image.tsx` (live status, 1200×630, verified on Anvil), layout
  `openGraph`/`twitter` metadata.
- `lib/use-notify.ts` (`useNotifyPref`, `useMineNotifications`), `NotifyToggle` in the mine header
  and the long-haul card, `ShareButton` on the found banner.
- CI `docker` job builds `ops/Dockerfile` and `indexer/Dockerfile`.
- Checks: app check; Playwright season rerun.

## 2026-09-04 – Mobile QA pass (390×844)

- Scripted pass over every route (horizontal overflow, elements wider than the viewport, tap targets
  under 32 px, unnamed buttons/links, console errors). Fixed: wallet buttons and chips wrapping,
  season header row, block-card ticker row and captions, footer/inline links padded to tap size,
  section links (Mine / Claim / Redeem / Leaderboard) were unreachable below `md`, now a scrolling row
  under the header. Result: no overflow, no console errors on any route.
- Still to do by hand on devices: wallet connect flows (WalletConnect modal), notification permission
  prompt on iOS Safari (requires the site to be added to the home screen), colour-contrast audit of
  the muted text on the panel background.
