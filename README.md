# Stock Miner

A 24-hour "virtual mining" game on Robinhood Chain. Players stake **$RIG** or RIG/USDC LP tokens to
activate virtual rigs, burn $RIG on GPU / cooling / overclock upgrades to raise their hashrate, and mine
**Stock Token fragments** across four reward blocks. When the fourth block unlocks the mine closes
permanently; stakes are returned and fragments are redeemed for tokenized stocks.

This repository currently holds the product and engineering specifications. No code yet.

## Documents

| # | Doc | What it answers |
|---|-----|-----------------|
| 1 | [PRD](docs/01-PRD.md) | What we are building, for whom, requirements, scope, success metrics |
| 2 | [Mining model](docs/02-MINING-MODEL.md) | **How mining works** and why it is not real browser mining |
| 3 | [Game design](docs/03-GAME-DESIGN.md) | Rigs, upgrades, heat, reward blocks, formulas, worked examples |
| 4 | [Tokenomics](docs/04-TOKENOMICS.md) | $RIG supply, sinks, LP bonus, prize-pool funding |
| 5 | [Contracts spec](docs/05-TECH-SPEC-CONTRACTS.md) | On-chain architecture, accounting math, interfaces, security |
| 6 | [App spec](docs/06-TECH-SPEC-APP.md) | Frontend, indexer, live "mining" UI, ops tooling |
| 7 | [Compliance & risk](docs/07-COMPLIANCE-AND-RISK.md) | Stock Token constraints, eligibility, legal review items |
| 8 | [Delivery plan](docs/08-DELIVERY-PLAN.md) | Milestones, team, testing, launch checklist |
| 9 | [Open questions](docs/09-OPEN-QUESTIONS.md) | Decisions still needed before build |
| – | [Glossary](docs/GLOSSARY.md) | Terms used across the docs |

Machine-readable pieces:

- `specs/contracts/*.sol` – Solidity interfaces the contracts must implement.
- `specs/params/season-default.json` – default season parameters referenced by the docs.

## One-paragraph answer to "is this browser mining?"

No. Nothing useful can be mined by a browser on a rollup, and real hashing would hand rewards to
whoever runs the most GPUs and bots rather than to stakers. "Mining" here is **stake-weighted
emission**: every rig has an on-chain hashrate number derived from its stake and upgrades, and each
reward block streams a fixed pool of fragments to rigs pro rata to hashrate-seconds. The browser only
renders the mine and shows a live estimate. See [docs/02-MINING-MODEL.md](docs/02-MINING-MODEL.md)
for the full comparison, including an optional, bounded "browser boost" mini-game for a later version.
