# Stock Miner – project memory for Claude Code sessions

Read this first. It is short on purpose; the detail lives in `docs/`.

## What this is
A progress-based virtual mining game on Robinhood Chain (Arbitrum Orbit L2). Players stake $RIG or
RIG/USDC LP to run virtual rigs, burn $RIG on upgrades, and earn Stock Token fragments across four
reward blocks. Blocks are found by accumulated hash-work, not by time. The mine closes when block 4 is
found. Spec set: `docs/01`–`09`, interfaces in `specs/contracts/`, params in `specs/params/`.

## Source of truth, in order
1. `specs/contracts/*.sol` – interfaces. Implementations must match them; change the interface first.
2. `docs/05-TECH-SPEC-CONTRACTS.md` – accounting math (§5) and invariants (§5.3). Tests encode these.
3. `docs/03-GAME-DESIGN.md` – formulas and tables; `specs/params/season-default.json` – numbers.
4. `docs/01-PRD.md` – requirement IDs (FR-*, NFR-*). Reference them in test names and commits.

The spec is not gospel. If implementing reveals a flaw, fix the spec **and** the code in the same
commit, and add a dated entry to `docs/DECISIONS.md` saying what changed and why.

## Hard rules (never relax without an explicit user decision)
- Season contracts are immutable: no proxies, no parameter setters, no difficulty adjustment, no
  admin power beyond `pause`.
- No mechanic may depend on wall-clock intervals. Everything is work / shifts. `maxDuration` is a
  fail-safe only.
- Rewards are `rigHash × seconds × ratePerWork[b]`, independent of other rigs. Do not reintroduce a
  reward-per-share accumulator.
- `Σ minted fragments for block b ≤ poolTokens[b] × fragPerToken`, enforced in `claim`.
- Upgrade spend is 100% burned. Stake per rig is immutable. Fragments are non-transferable in v1.
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
forge snapshot --check                      # gas regressions
cd sim && uv run pytest && uv run python -m sim.run --params ../specs/params/season-default.json
pnpm -r check                               # everything
```

## Environment notes
- Foundry may be missing in a fresh remote session: run `foundryup` (network goes through the proxy).
- Chain assumptions (Orbit, Stock Token hooks, DEX, oracle) are unverified; see `docs/01-PRD.md` §10.
  Build against mocks in `contracts/test/mocks/` that model the *expected* restrictions.
