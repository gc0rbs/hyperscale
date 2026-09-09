# Hyperscaler

**Virtual GPUs. Stock-token rewards.** An AI-compute game on Robinhood Chain, forked from
[stock-miner](https://github.com/gc0rbs/stock-miner) on 2026-09-06 and renamed Hyperscaler with the
$VRAM token on 2026-09-09 (design handoff). The fiction is a GPU cluster; the payout is shards of
NVDA, MU, SNDK and QQQ Stock Tokens. The term map lives in `docs/12-REBRAND-AI-INFERENCE.md`;
contract identifiers keep the mining vocabulary on purpose, so the mining terms below remain
accurate in the code.

Players stake **$VRAM** (a Pons-launched ERC-20) to activate a virtual GPU, burn $VRAM on GPU /
cooling / overclock upgrades to raise its throughput, and earn **Stock Token shards**. Since
2026-09-08 the game runs continuously in **hourly rounds** (`docs/13-ROUNDS.md`): the Pons trading
tax on $VRAM is swapped into the four Stock Tokens and fills the running round's pot; at the close
the pot is split by the work each GPU did that hour, claims are open for fifteen minutes, and
anything unclaimed rolls into the next pot. Shards redeem for the Stock Token or a USDG cash-out at
any time. The earlier season mode (four reward blocks, a fixed pool, a six-hour cap) stays in the
repo as the previous design; nothing live runs on it.

- **Public docs (players, safety):** `gitbook/` (GitBook Git Sync via `.gitbook.yaml`).
- **Internal specs:** `docs/` (PRD, game design, tech specs, runbook, audit package, decisions).
- **Contracts:** `contracts/`; **app:** `app/`; **indexer:** `indexer/`; **ops:** `ops/`; **simulation:** `sim/`.

## Developing

pnpm workspace with five packages. Every package has a `check` script; the root runs them all.

```
bash .claude/hooks/session-start.sh   # fresh machine: Foundry, pnpm install, uv sync (idempotent)
pnpm -r check                          # lint + typecheck + tests for every package
cd contracts && forge test             # unit / fuzz / invariant / scenario
cd sim && uv run --extra dev pytest    # simulation tests
pnpm --filter @stock-miner/app dev     # Next.js dev server
```

| Package | Stack | Check |
|---|---|---|
| `contracts/` | Foundry, OpenZeppelin 5, solc 0.8.28 | interfaces match `specs/contracts/`, fmt, build, test |
| `sim/` | Python 3.11, uv, numpy, hypothesis | ruff, pytest |
| `app/` | Next.js 15, React 19, wagmi/viem, Tailwind; tokens from `specs/design/tokens.css` | eslint, tsc, vitest |
| `indexer/` | Ponder (stub until the ABI exists) | tsc |
| `ops/` | TypeScript scripts: plan, fund, keeper, watch, guardian, sweep; forge-script wrappers | tsc, vitest |

Deploying and running the round mine: `docs/RUNBOOK-ROUNDS.md` (season mode: `docs/RUNBOOK.md`). Audit material: `docs/AUDIT-PACKAGE.md`.

CI (`.github/workflows/ci.yml`) runs the same groups plus slither. The build follows `docs/10-BUILD-PLAN.md`;
`docs/BUILD-LOG.md` is the hand-off between sessions.

## Documents

| # | Doc | What it answers |
|---|-----|-----------------|
| 1 | [PRD](docs/01-PRD.md) | What we are building, for whom, requirements, scope, success metrics |
| 2 | [Mining model](docs/02-MINING-MODEL.md) | **How mining works**, why difficulty replaces the clock, why it is not browser mining |
| 3 | [Game design](docs/03-GAME-DESIGN.md) | Rigs, upgrades, heat, shifts, reward blocks, formulas, worked examples |
| 4 | [Tokenomics](docs/04-TOKENOMICS.md) | $VRAM supply, sinks, LP bonus, prize-pool and difficulty sizing |
| 5 | [Contracts spec](docs/05-TECH-SPEC-CONTRACTS.md) | On-chain architecture, work-based accounting math, interfaces, security |
| 6 | [App spec](docs/06-TECH-SPEC-APP.md) | Frontend, indexer, live "mining" UI, ETA display, ops tooling |
| 7 | [Compliance & risk](docs/07-COMPLIANCE-AND-RISK.md) | Stock Token constraints, eligibility, legal review items |
| 8 | [Delivery plan](docs/08-DELIVERY-PLAN.md) | Milestones, team, testing, launch checklist |
| 9 | [Open questions](docs/09-OPEN-QUESTIONS.md) | Decisions still needed before build |
| 10 | [Build plan](docs/10-BUILD-PLAN.md) | Phases and the Claude Code prompt for each; how to start |
| 11 | [Design brief](docs/11-DESIGN-BRIEF.md) | Visual direction (approved), principles, type, colour, components, motion; mockups and references in `design/` |
| – | [Round runbook](docs/RUNBOOK-ROUNDS.md) | Deploy, launch, fund, keep and halt the round mine with the ops scripts |
| – | [Audit package](docs/AUDIT-PACKAGE.md) | Scope, trust assumptions, actors, accounting argument, invariants, findings, how to run everything |
| – | [Decisions](docs/DECISIONS.md) | Dated log of spec, design and build decisions |
| – | [Glossary](docs/GLOSSARY.md) | Terms used across the docs |

`CLAUDE.md` holds the standing rules every build session reads first.

Machine-readable pieces:

- `specs/contracts/*.sol` – Solidity interfaces the contracts must implement.
- `specs/params/season-default.json` – default season parameters referenced by the docs.
- `specs/design/tokens.css` / `tokens.json` – the app's design tokens.
- `design/artboards/` – mockups of the key screens, generated by `design/build-artboards.py`.

## Two-paragraph answer to "is this browser mining, and how long does a mine last?"

Not browser mining. Nothing useful can be hashed by a browser on a rollup, and real hashing would hand
rewards to whoever runs the most GPUs and bots rather than to stakers. "Mining" is **stake-weighted
work**: every rig has an on-chain hashrate derived from its stake and upgrades, and every second it
runs it contributes `hashrate × 1s` of work to the current block. Each block pays a fixed number of
fragments per unit of work, so a rig's income per second depends only on its own hashrate.

The mine has **no fixed duration**. Each block has a difficulty in hash-seconds and is found when the
mine's total work reaches it. More total hashrate means blocks are found sooner, so the season's length
is set by participation, not by a calendar. Seasons are sized to last a few hours and carry a hard cap
(default 6h): if block 4 is not found by then the season ends, what was mined is paid and the rest rolls
into the next season. Players can leave early for a small fee. See
[docs/02-MINING-MODEL.md](docs/02-MINING-MODEL.md).
