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
