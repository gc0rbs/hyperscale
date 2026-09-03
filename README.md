# Stock Miner

A progress-based "virtual mining" game on Robinhood Chain. Players stake **$RIG** or RIG/USDC LP
tokens to activate virtual rigs, burn $RIG on GPU / cooling / overclock upgrades to raise their
hashrate, and mine **Stock Token fragments** across four reward blocks. A block is *found* when the
mine has accumulated its difficulty in hash-work; how long that takes depends only on how much hashrate
is pointed at it. A busy mine finishes in a day, a quiet one runs for weeks. When the fourth block is
found the mine closes permanently; stakes are returned and fragments are redeemed for tokenized stocks.

This repository currently holds the product and engineering specifications. No code yet.

## Documents

| # | Doc | What it answers |
|---|-----|-----------------|
| 1 | [PRD](docs/01-PRD.md) | What we are building, for whom, requirements, scope, success metrics |
| 2 | [Mining model](docs/02-MINING-MODEL.md) | **How mining works**, why difficulty replaces the clock, why it is not browser mining |
| 3 | [Game design](docs/03-GAME-DESIGN.md) | Rigs, upgrades, heat, shifts, reward blocks, formulas, worked examples |
| 4 | [Tokenomics](docs/04-TOKENOMICS.md) | $RIG supply, sinks, LP bonus, prize-pool and difficulty sizing |
| 5 | [Contracts spec](docs/05-TECH-SPEC-CONTRACTS.md) | On-chain architecture, work-based accounting math, interfaces, security |
| 6 | [App spec](docs/06-TECH-SPEC-APP.md) | Frontend, indexer, live "mining" UI, ETA display, ops tooling |
| 7 | [Compliance & risk](docs/07-COMPLIANCE-AND-RISK.md) | Stock Token constraints, eligibility, legal review items |
| 8 | [Delivery plan](docs/08-DELIVERY-PLAN.md) | Milestones, team, testing, launch checklist |
| 9 | [Open questions](docs/09-OPEN-QUESTIONS.md) | Decisions still needed before build |
| – | [Glossary](docs/GLOSSARY.md) | Terms used across the docs |

Machine-readable pieces:

- `specs/contracts/*.sol` – Solidity interfaces the contracts must implement.
- `specs/params/season-default.json` – default season parameters referenced by the docs.

## Two-paragraph answer to "is this browser mining, and how long does a mine last?"

Not browser mining. Nothing useful can be hashed by a browser on a rollup, and real hashing would hand
rewards to whoever runs the most GPUs and bots rather than to stakers. "Mining" is **stake-weighted
work**: every rig has an on-chain hashrate derived from its stake and upgrades, and every second it
runs it contributes `hashrate × 1s` of work to the current block. Each block pays a fixed number of
fragments per unit of work, so a rig's income per second depends only on its own hashrate.

The mine has **no fixed duration**. Each block has a difficulty in hash-seconds and is found when the
mine's total work reaches it. More total hashrate means blocks are found sooner, so the season's length
is set by participation, not by a calendar. A fail-safe maximum duration exists only so stakes can never
be locked forever, and players can leave early for a small fee. See
[docs/02-MINING-MODEL.md](docs/02-MINING-MODEL.md).
