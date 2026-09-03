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
