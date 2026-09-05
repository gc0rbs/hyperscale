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
  testnet season on 46630 with mocks; audit (client's); Pons launch (client's) → treasury wallet → adapters →
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

## 2026-09-04 – Launch status (current release checklist, docs/08 §4)

Everything engineering can do without the real token, keys and counsel is done and pushed. This
table supersedes the Phase 4 checklist above.

| Item | Status |
|---|---|
| Params JSON published with hash before `openTime` | `ops plan --pool-usd … --max-duration 21600` prints the hash; `CreateSeason` records it and the creation block. No 48h minimum (short seasons) |
| `SeasonFactory.create` executed and contracts verified | scripts + dry run; `--verify` flags in RUNBOOK §1–3. Needs the graduated $RIG address (Pons launch, client's) and the treasury wallet address |
| Vault funded; `phase() == PreOpen`; app shows pool | `ops fund` asserts PreOpen; app shows pool and USD value |
| Eligibility adapter | `OpenEligibility` (Stock Tokens have no transfer hook); legal restriction is the geo-fence + terms. `ops deploy-adapters` |
| Oracle feeds live and within staleness | `ChainlinkOracle` over the four recorded feeds, 26h cap (24h heartbeat); `deploy-adapters` checks every feed answers |
| Difficulty sized; pace and cap published | `ops plan` from a hash estimate; cap = 2× planned (6h default) shown in the app from the start |
| Keeper, alerting, on-call | `docker-compose.yml` (Postgres, indexer, keeper, watcher); watcher posts to `ALERT_WEBHOOK_URL`. Needs a host, a keeper hot wallet and the webhook |
| Terms, how-rewards-work, geo-fence | `/terms` (draft for counsel), `/how-it-works`, edge middleware (US/CA/GB/CH → 451). Counsel wording pending |
| Pause key holders; cancellation rehearsal | RUNBOOK §7; rehearsed on Anvil (scenario + e2e). Testnet rehearsal pending a funded 46630 key |
| Post-close plan | RUNBOOK §8; `ops sweep` repeatable |
| App hosting | `app/.env.example`, RUNBOOK §10, share card and WalletConnect need `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_WC_PROJECT_ID` |

**Client's items before launch** (2026-09-04: Pons launch, treasury and audit are the client's; no
multisig): Pons launch → $RIG address; treasury wallet (hardware, single key); funded deployer,
operator and keeper keys (env only); host for the compose stack and the app; WalletConnect project id;
alert webhook; counsel review of `/terms`; external audit
(`docs/AUDIT-PACKAGE.md`); testnet rehearsal on 46630 with `DEPLOY_MOCKS`.

**Resolved after this table**: Humane licence (freeware, commercial use allowed, files unmodified; see
`app/src/fonts/humane/LICENSE.md`; keep the repo private while the TTFs are committed).

**Known gaps**: ERC-8056 `balanceOfUI` display (no surface shows Stock Token balances yet); testnet
explorer and faucet unconfirmed; geo-fence depends on the host's country header; Docker images
build in CI but have not been run end to end on a host from this session.

## 2026-09-04 – Public docs (GitBook)

- `gitbook/` with `.gitbook.yaml` root: welcome, getting started (3), playing (8), safety (9),
  reference (6: parameters, formulas, addresses incl. Stock Tokens and Chainlink feeds, FAQ, glossary,
  terms summary). Written from docs/03, 04, 05 §5.3, 07, AUDIT-PACKAGE §2/§3/§9 and the params
  template; every number is the season default and labelled as such.
- Root README brought up to date (Pons token, season-1 set, 3h/6h, links to gitbook/ and docs/).
- RUNBOOK §10b: how the GitBook syncs and what to update per season.
- To do when known: the audit report link, season contract addresses, the $RIG address.

## 2026-09-04 – Audit remediation (docs/AUDIT-RESPONSE-2026-09-04.md)

- Every confirmed bug (B1–B14), high-risk item (R1–R5) and integration item (I1–I6) from the
  2026-09-04 codebase audit is resolved or was already fixed on this branch; the response document
  maps each to its change and regression test.
- Validation rerun on this branch: workspace checks (app 9 tests, ops 13, indexer, sim unchanged);
  `next build` clean; Foundry 51 tests + 10 invariants; differential campaign **100,000 traces,
  0 mismatches**; Playwright 3 scenarios incl. the failed-purchase case; `pnpm audit --prod`
  0 critical / 0 high (7 moderate, 1 low, transitive); Solidity formatted; gas snapshot regenerated
  under Foundry v1.5.1 (now pinned in CI). The 10.24M-call invariant campaign was started on this
  commit; its result is recorded in the next entry.
- Known gaps still open (from the audit's coverage list): indexer automated tests, wrong-chain with a
  real wallet extension, refresh during confirmation, visual regression.

## 2026-09-05 – mainnet deployer, $RIG on the site, pre-open screen, header status

Plan: get the contracts onto Robinhood Chain mainnet (4663) without Forge's forked simulation (the
public RPC rate-limits it), make the site show the real token once Pons launches, and give the mine a
proper face before it opens.

What shipped:
- `ops deploy-mainnet factory|adapters|season`: one transaction at a time with viem, same deployment
  files as the Forge scripts. `season` simulates `SeasonFactory.create` first and refuses a plan whose
  params changed after `plan` (paramsHash check). Rehearsed end to end on Anvil.
- Landing "Buy token" dialog: contract address with copy, official purchase link and Blockscout link,
  driven by `NEXT_PUBLIC_RIG_ADDRESS` / `NEXT_PUBLIC_RIG_BUY_URL`; "coming soon" until both exist.
- `OpeningSoon`: the pre-open screen used both before a season exists (`/mine` without a deployment)
  and between creation and `openTime` (countdown, pools, work shares, activate / get $RIG actions).
- Header status cluster from the launch mockup (`design/launch/53`): live dot, season name, phase chip
  in the shared chrome; the duplicate phase chip left the mine page.
- Railway image runs the traced standalone server under plain `node` (crash traces reach the deploy
  log; the earlier "Ready then dead" was the custom domain targeting port 8080, see RUNBOOK §10c).

What's next: fund the deployer (`0x0F89…D0a2`) with ~0.05 ETH, get the $RIG address from the Pons
launch, then factory → adapters → plan → season → fund on 4663; set the app's `NEXT_PUBLIC_*` and
redeploy; put stockminer.fi behind Cloudflare so the geo-fence header exists.

Known gaps: the Pons token page URL format is unverified, so the buy link is an env value rather
than derived from the address; mainnet deployment JSONs must be force-added (gitignored).

## 2026-09-05 – Railway hosting live; testnet season; launch comms

**What shipped**
- `docs/LAUNCH-SOCIAL-GUIDE.md`: 72-hour launch post plan, token-only, with copy guardrails from docs/07.
- Railway: `app/Dockerfile` (Next.js), `railway/{app,indexer,keeper,watch}.json`, `/api/health`
  liveness route. Project `shimmering-inspiration` runs `app`, `indexer`, `keeper`, `Postgres`;
  app at `https://app-production-8f29.up.railway.app`. RUNBOOK §10c is the procedure.
- Ops: chain profiles accept `${VAR:-default}` (the Robinhood profiles already used it, but `expand`
  only handled `${VAR}`); `loadDeployment` falls back to `MINE_ADDRESS` env; `fund --mint-mocks`
  allowed only with a DEPLOY_MOCKS factory deployment (the logo-mark branch's check, adopted on merge); `robinhood-testnet.json` set to `mocks: true` with
  the Blockscout explorer API.
- Main merged (PR #3) with the audit remediation branch; this branch rebuilt on top of it, dropping
  its duplicates of the geo-fence, Dockerfiles, chain profile and Next upgrade in favour of the
  remediated versions.

**Testnet season 1 (chain 46630)**: factory + mocks, season sized 1M hash / 1h / 2h cap, funded,
Railway pointed at it. Re-created on the remediated contracts after the merge (addresses in the Railway
variables and `contracts/deployments/46630.json`, not in git).

**Known gaps**: Railway services still deploy from `railway up`, not from GitHub (dashboard step);
three stray Postgres services and the five empty `@stock-miner/*` services from the original import
need deleting in the dashboard; Cloudflare zone pending the domain; the mock oracle's timestamps are
fixed at deploy time, so cash-out on the testnet needs an `oracle.set` refresh before use.

## 2026-09-04 – Interactive public landing page

Plan: replace the chain-dependent home screen with four accessible editorial sections explaining
activation, upgrades, reward blocks and redemption in plain language. Build original real-time 3D
mineral, rig and token scenes inspired by the supplied palette and materials; do not embed reference
images. Isolate the existing wallet/game routes in their own layout, preserve their URLs, and verify
the production build plus desktop/mobile interactions, reduced motion and unavailable WebGL.

The user requests a new landing-page art direction; previous static mockup/motion constraints apply
to the game UI, not this new marketing experience. Issue tracker `bd` is unavailable on this machine;
implementation and follow-up notes are recorded here.

Shipped: four public landing chapters with original Three.js scenes, a GPU configurator, selectable
reward blocks, token assembly, and native FAQ disclosures. Wallet/game providers now live in a route
group; existing game URLs and page implementations are preserved. The public page renders without a
season deployment. All section eyebrows were removed following review. A separate full-width black
starfield extends behind the hero; the original illustration viewport remains unchanged. Core
expansion follows scroll progress from the top of the page through the hero's exit and reverses on
scrolling back; its former button is removed.

Verification: app lint, typecheck and six unit tests pass. Production build passes (public home is
statically rendered; 115 kB first-load JS with Three.js deferred). Desktop controls and 390 px mobile
navigation, GPU switching, reward selection, token assembly and FAQ work. Mobile has no horizontal
overflow; all four scenes initialize under reduced motion. Browser measurements confirm the hero
illustration's original dimensions and position, with a viewport-wide starfield. Existing game pages
are moved without content changes. Local preview remains on port 3010. WebGL has a vector fallback;
real-season operations still require the existing deployment and chain services.

### Hero entrance refinement

The hero now plays a one-time entrance: the central mineral appears first, then stones and shards
burst from the center with overlapping short delays and a small overshoot, settling within about
0.9 seconds of visible animation. The existing scroll expansion is composed independently, and the
final mesh positions/scales are preserved. Reduced motion skips the entrance. The hero's vector
fallback appears only when rendering fails, avoiding a static-image flash before the entrance.
Rounded star radii/opacities prevent server/browser floating-point hydration differences.

Validation: app lint, typecheck and six tests pass. Fresh browser loads and reduced-motion reloads
return HTTP 200 with no console errors; scroll interaction remains available. Disabling WebGL
shows the vector illustration and keeps the heading visible. Preview server restarted cleanly.

### Static landing-page publishing

Prepared a separate static export for the user's requested here.now deployment. The export builds
from the existing landing components and fonts, retains 3D interactions, and shares the unavailable-
season component for game destinations. Generated output and private publishing state are ignored.
The normal Next.js app and its active local preview keep their server routes. Build and publishing
instructions are in docs/HOSTING.md.

Published the landing-page export at https://witty-breeze-ggxj.here.now/ on 2026-09-04.
The publish was finalized successfully in anonymous mode (24-hour expiry). Private claim details
remain exclusively in ignored local publisher state and the user handoff.
Validation: production static export, lint/typecheck and six unit tests pass. The public site loads
its 3D canvas, changes GPU power to 2.0×, switches reward selection and assembles the token. Game CTA
and the return link work. At 390 px the page has no horizontal overflow. Browser console is clean.

### Hero material realism

Plan: preserve the hero composition, entrance and scroll choreography while replacing uniform
surfaces with fractured basalt, translucent amber, fine mineral detail and animated cyan seams.
Use controlled lighting and restrained bloom, then verify desktop/mobile rendering, scroll reversal,
reduced motion and fallback before updating the existing here.now publish. The installed `bd` CLI
has no database for this checkout; record this scoped work and any follow-ups here.

Scope extension: remove the hero edge mask; float the rig directly on the page without its preview
frame, annotation text or controls. Drive the rig's three builds and the four reward blocks from
native scrolling. Give the four main chapters at least a viewport of space, introduce staggered
text entrances, and verify sticky scenes on small/short viewports without trapping content.

The user supplied the final gold pickaxe logo during review. Preserve the original transparent PNG
and use it for the shared brand mark and browser icon; include it in the isolated static export.

Shipped: the hero now uses individually fractured/bevelled basalt meshes, object-space surface
shaders, transmissive amber with internal inclusions, studio reflections, soft shadows, animated
cyan seams and fine dust. Its original camera, composition and entrance/scroll layering remain.
Transparent rendering replaces the hero edge mask. The rig and reward scenes also render directly
over the page, with restrained lighting/bloom and no rectangular backdrop.

Rig preview annotations and buttons are removed. Native scroll drives three builds with resting
intervals between smooth upgrades; four reward blocks advance and reverse with scroll. Sticky
stages allow every state to be read, adapt to tall content on short screens, and fill at least one
viewport. Text fades/lifts in with small staggered delays. Mobile uses a compact reward sequence;
at 390×844 both scroll chapters fit their text and illustration in one viewport. Reduced motion
shows text immediately and skips decorative motion while retaining scroll-dependent states.

Validation: app lint, typecheck and all six tests pass; isolated production export passes at 115 kB
initial JS with 3D deferred. Desktop screenshots verify all three rig states; the public site cycles
NVDAx → TSLAx → AAPLx → SPYx and back. The hero has no edge mask, mobile has no horizontal overflow,
and the live browser reports no console errors. A local desktop sample maintained ~16.5 ms frame
cadence. At 375×667, reduced motion and disabled WebGL preserve visible fallback art and all reward
states. The supplied PNG is byte-for-byte preserved and used in the header, footer and browser icon.

Updated https://witty-breeze-ggxj.here.now/ successfully on 2026-09-04 (anonymous 24-hour preview).
Known gaps: gameplay still requires a live season/backend. Next 15's existing development hot-reload
manifest issue recurred during edits; restarting the local preview restored normal rendering. The
production export and hosted version are unaffected. No remaining work in this visual scope.

### Continuous section scrolling

Plan: remove sticky positioning and extra scroll distance from the rig/reward chapters. Map their
animation progress directly from section entry at the viewport bottom to section exit at the top,
retain each chapter's viewport-height minimum, and verify forward/reverse scrolling before updating
the existing publish. Keep the hero's already unpinned entrance/exit behavior.
Also vertically center the hero's copy and illustration within its available area. The rig/reward
stage contents and redemption columns retain their middle alignment; tall mobile content flows
naturally without clipping or forced centering beyond the viewport.

Shipped: rig and reward sections now flow directly with the page. Removed sticky positioning,
extra section travel and the rig's held animation intervals. Progress spans first section entry
through complete exit; reward rotation is continuous while the active token advances through four
states. The hero copy and illustration are centered on the same vertical axis within the usable
section area. Full-viewport minimum heights, text entrances and reduced-motion support remain.

Verification: full app check (lint, types, six tests) and production static export pass. At 1440×1000
the rig/reward sections are each 1000 px, and a 200 px scroll moves the content exactly 200 px. At
390×844 they are each 844 px, with a matching 180 px movement and no horizontal overflow. The four
rewards advance and reverse correctly; browser errors are empty. Hero copy and art centers both
measure 564 px in a usable area centered at 564 px. No remaining work in this refinement.

### 2026-09-04 — Uninterrupted section transitions

Plan: remove the decorative horizontal dividers between page sections, including the header,
hero/reward strip, mine, FAQ introduction and footer. Preserve internal list/control borders and
the current spacing, middle alignment and native scroll animations. Check desktop/mobile styles,
run the app checks and static export, and update the existing here.now publish.

Scope update: retain only the pickaxe in the header, extend the hero starfield behind it, add a
full amber metallic treatment to Enter the mine and an orange Buy token text action. The official
purchase URL is pending; show a clear purchase-link placeholder until provided. Restore native
sticky stages for the rig/reward sections, with measured tall-screen handling and continuous,
gently eased scene progress rather than abrupt state jumps. Keep centered content and reduced
motion support. The hero composition and its unpinned scroll behavior remain intact.

Shipped: removed section divider rules, retained the standalone pickaxe in the header and extended
the same starfield behind the transparent navigation. Enter the mine has an amber metallic fill,
subtle moving sheen and hover lift. The orange Buy token action opens an accessible Coming soon
dialog because the user confirmed the purchase page is not live. Escape/backdrop dismissal and
focus return work. Rig/reward stages are sticky again, centered with 110/150 viewport-percent travel.
Rig upgrades ease into each build with a continuous smootherstep curve and existing frame-rate
independent scene damping; reward rotation remains continuous. Reduced motion removes pinning.

Verification: app lint, types and six tests pass; static export succeeds at 116 kB initial JS.
Desktop section borders compute to zero; both stages remain fixed through their entire scroll
range, and rewards advance/reverse correctly. At 390×844 header controls fit without horizontal
overflow. At 375×667 the taller reward stage uses a -61 px sticky offset so its bottom remains
reachable. Browser errors are empty. The existing beads database remains unavailable (`bd sync`);
this log records the work. Remaining dependency: wire the official purchase URL once it is live.

### 2026-09-04 — Buy token navigation placement

Plan: move the orange Buy token action to fourth position in the central navigation and mobile
menu. Keep the mine button separate on the right and retain the existing Coming soon dialog.
Verify both menu layouts, run the app checks/export, and update the same public preview.

Shipped: Buy token is fourth in the central desktop navigation and the mobile menu, with its
orange styling and Coming soon dialog preserved. The mine button remains separate on the right.
Desktop menu text shares the same vertical center; mobile has no horizontal overflow, and dialog
Escape dismissal restores focus to Buy token. App lint, types, six tests and static export pass.
No additional work in this placement change; the purchase URL dependency remains as noted above.

### 2026-09-04 — Reference-aligned mineral art direction

Plan: align the header, page palette and all four procedural scenes with the supplied amber/cyan
references. Replace the olive cast with warm mineral black, emphasize luminous faceted amber and
ivory highlights, use cyan on crystal silhouettes and cooling accents, and replace the heavy
hero rock halo with finer golden fragments and an orbital dust trail. Apply one material/lighting
language to gems, rig and coin, including vector fallbacks. Preserve typography, layout, header
navigation, entrance timing and pinned scroll interactions. Inspect rendered desktop/mobile scenes,
reduced motion and WebGL fallback, then run app checks/export and update the existing preview.

Shipped: warm mineral black now carries through the header, chapters, redemption and FAQ. Amber,
ivory and cyan replace the olive cast in text, controls and illustrations. The mine CTA includes
faceted highlights. The hero's heavy rock halo is now smaller golden mineral fragments surrounding
a brighter transmissive amber core. A depth-tested cyan silhouette replaces the line across the
crystal face; both hero and reward crystals share the faceted geometry and optical treatment.
All scenes use the same studio environment, restrained bloom and warm/cool lighting. The rig has
amber processors and cyan cooling, and the coin floats on the dark page without an edge mask.
Orbital dust uses one points draw per scene (1100/680/180/400 points for core/reward/rig/token).
The existing logo, layout, navigation order, introduction, scroll mapping and text entrances remain.

Verification: app lint, typecheck and six tests pass. Desktop/mobile rendered screenshots cover all
four scenes. Rewards advance NVDAx → TSLAx → AAPLx → SPYx and reverse; the coin still assembles.
At 390×844 there is no horizontal overflow, and all four canvases have no CSS mask. Reduced motion
removes both pinned stages and reveals all text; disabling WebGL displays the amber/cyan vector
fallback. Normal rendering reports no shader or page errors. No new assets or packages were added.
The beads database remains unavailable; this log records the completed work. The existing purchase
URL dependency is unchanged.
## 2026-09-04 – first testnet deployment (Robinhood Chain testnet, chain 46630)

Rehearsal season with the mock token set, deployed from a throwaway key. Explorer:
https://explorer.testnet.chain.robinhood.com

| Contract | Address |
|---|---|
| SeasonFactory | `0xF98f1De589D1fdDCAdd62500373B807B07720A2a` |
| SeasonMine (season 0) | `0xcA24Ea657371E27B3281a1DfF5A1e8119De71D40` |
| StockFragments | `0xdd2712C6457E15993D1d0ab30c3719F30c757621` |
| RedemptionVault | `0x776E7993c4527EA5EB834ce1fdB61580f41497Bc` |
| RIG (mock) | `0x6E323a6B2De8c3Df127b5FD0E253b73AEb270264` |
| LP, USDC (mocks) | `0x0E5A6F524e8cD877B8Ae71047dE9E957500928a0`, `0x127bc68E1DfCa3f6Ea512Ed391F7CfBEB934f2f2` |
| Oracle, eligibility (mocks) | `0xC74779bB0cC5b77BADD2B9F68D8D4Bd133D48893`, `0x14B4767E4984E8178F175e81BC7E363c54895E09` |
| Stocks NVDAx/TSLAx/AAPLx/SPYx (mocks) | `0x50EC…ffA1`, `0xaaF1…B2e6`, `0xF9e6…278c`, `0x51e9…F387` |

Season `testnet-rehearsal-1`: planned 3600s at 1,000,000 RIG-eq, cap 7200s, open 2026-09-04T21:06:35Z,
paramsHash `0xb93674952af9d14b02e8346eeadace7e72063b9a062dd902240b88b3eff257cb`, vault funded, phase PreOpen.
Deployer/operator/treasury are all the throwaway key (`0xa5b712ba714118CB75615AD5103E14c8F4680939`).

What shipped: `ops/chains/robinhood-testnet.json` filled in, `robinhood-testnet-mocks.json` profile, the
`robinhood_testnet` RPC alias, and `fund --mint-mocks` now works on any chain whose factory deployment
recorded mocks. Gas for factory + season + funding was ~0.0005 ETH.

Known gaps: contracts are not verified on the explorer (`--verify --verifier blockscout` not run); no LP
pair exists so `plan` used `--rig-per-lp 2`; the deployment JSONs are gitignored and live only in this
session, so re-run `create-season` dry-run or copy them from here before deploying the app.
