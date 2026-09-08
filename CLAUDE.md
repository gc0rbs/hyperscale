# Hyperscale – project memory for Claude Code sessions

Read this first. It is short on purpose; the detail lives in `docs/`.

## What this is
This repo is **Hyperscale**, forked from `gc0rbs/stock-miner` on 2026-09-06. The product fiction is an
AI-compute cluster (nodes, throughput, inference jobs, epochs, shards); see `docs/12-REBRAND-AI-INFERENCE.md`
for the term map. Contract identifiers and the docs below still use the mining vocabulary on purpose.

A virtual mining game on Robinhood Chain (Arbitrum Orbit L2, chain 4663). Players stake $RIG (a
Pons-launched ERC-20) to run virtual rigs, burn $RIG on upgrades, and earn Stock Token fragments.
**Since 2026-09-08 the mine is continuous with hourly rounds** (`docs/13-ROUNDS.md`, contracts in
`contracts/src/rounds/`): each round's pot comes from the Pons fee stream, is split by work done in
that hour, is claimable for 15 minutes, and rolls over if unclaimed. The season contracts
(`SeasonMine` etc.) stay in the repo only because the 2026-09-05 mainnet seasons run out under them.
Spec set: `docs/01`–`09` (season era), `docs/13` (rounds), interfaces in `specs/contracts/`, params in
`specs/params/`.

## Source of truth, in order
1. `specs/contracts/*.sol` – interfaces. Implementations must match them; change the interface first.
2. `docs/05-TECH-SPEC-CONTRACTS.md` – accounting math (§5) and invariants (§5.3). Tests encode these.
3. `docs/03-GAME-DESIGN.md` – formulas and tables; `specs/params/season-default.json` – numbers.
4. `docs/01-PRD.md` – requirement IDs (FR-*, NFR-*). Reference them in test names and commits.

The spec is not gospel. If implementing reveals a flaw, fix the spec **and** the code in the same
commit, and add a dated entry to `docs/DECISIONS.md` saying what changed and why.

## Hard rules (never relax without an explicit user decision)
- Mine contracts are immutable: no proxies, no parameter setters. The one exception is the one-shot
  `launch(rig, genesis)` on a pre-token `RoundMine` (client requirement 2026-09-08). Admin power is
  exactly `pause` (guardian), `halt` and that `launch` (operator; stated on the site)
  and, for the legacy seasons, `abort` inside the rescue window.
- Rounds are wall-clock (`roundSeconds`), and within a round every reward is by exact work share:
  `pot[r] × rigWork[r] / roundWork[r]`, settled per round from piecewise-constant hash. No
  reward-per-share accumulator, no difficulty, no randomness. (Season era: rewards were
  `rigHash × seconds × ratePerWork[b]`; keep that code as is.)
- `Σ claimed fragments for round r ≤ pot[r]`, enforced in `claim`; the vault always holds the stock
  behind every unredeemed fragment, every unclaimed pot and the running pot. Funding lands in the
  running round and is locked at its close; nothing is scheduled ahead.
- Upgrade spend is 100% burned: transferred to `0x…dEaD` (the token has no burn function). Stake per rig
  is immutable. Fragments are non-transferable in v1.
- No randomness, no oracles inside `SeasonMine`. Oracle use is confined to `RedemptionVault.cashOut`.
- v1.1 items (rig NFTs, transferable fragments, browser boost) are out of scope; do not build them.

## Repo layout (target)
```
contracts/   Foundry. src/, test/{unit,fuzz,invariant,scenario}, script/, gas-snapshots
sim/         Python agent-based economic simulation (uv/pyproject)
app/         Next.js + wagmi/viem + Tailwind; reads chain directly, indexer optional
indexer/     Ponder
ops/         season scripts: plan, fund, keeper, watch, sweep
docs/        specs (this set) + DECISIONS.md + BUILD-LOG.md
```
pnpm workspaces at the root; `pnpm -r check` runs every package's lint + typecheck + tests.

## Working agreement for a build session
- Start by reading the docs the phase prompt names, then write a short plan into `docs/BUILD-LOG.md`
  under a dated heading before writing code.
- Test-first for contracts: encode the invariant or scenario, watch it fail, implement, watch it pass.
- Run the package's full check before every commit. Never commit red.
- Commit small and often on the designated branch with messages that cite FR/NFR ids.
- When blocked on a decision that only the user can make, do everything else first, then ask once,
  with a recommended default.
- Before finishing, re-read your diff adversarially: what would an auditor flag? Fix it or log it.
- Append a "what shipped / what's next / known gaps" entry to `docs/BUILD-LOG.md`.

## Commands
```
foundryup                                   # install/update Foundry (contracts)
cd contracts && forge build && forge test   # unit + fuzz + invariant
forge test --match-path 'test/scenario/*'   # scenarios incl. pace-replay
forge snapshot --check --no-match-test 'testFuzz|invariant_'   # gas regressions (deterministic tests)
FOUNDRY_PROFILE=campaign forge test --match-path 'test/invariant/*'   # 10M-call invariant campaign
DIFF_OUT=diff/t.jsonl forge test --match-contract DiffTrace --fuzz-runs 100000 && cd ../sim && uv run python -m sim.diff ../contracts/diff/t.jsonl
cd sim && uv run pytest && uv run python -m sim.run --params ../specs/params/season-default.json
pnpm -r check                               # everything
cd ops && pnpm deploy-factory / plan / create-season / fund / keeper / watch / guardian / sweep   # docs/RUNBOOK.md
```

## Environment notes
- Foundry may be missing in a fresh remote session: run `foundryup` (network goes through the proxy).
- `forge script --broadcast` against local Anvil needs `NO_PROXY=127.0.0.1,localhost` in remote sessions
  (`ops/scripts/forge-script.sh` sets it); without it the broadcast hangs on the agent proxy.
- `pkill -f "next dev"` kills the tool shell; use `pkill -f "[n]ext-server"`.
- Chain assumptions (Orbit, Stock Token hooks, DEX, oracle) are unverified; see `docs/01-PRD.md` §10.
  Build against mocks in `contracts/test/mocks/` that model the *expected* restrictions.
