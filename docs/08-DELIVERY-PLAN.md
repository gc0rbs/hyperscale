# Delivery plan

## 1. Milestones

| M | Name | Duration | Exit criteria |
|---|---|---|---|
| M0 | Discovery | 2 weeks | All assumptions in PRD §10 verified or replanned; Stock Token access path decided (doc 09 Q1); counsel engaged; params v1 frozen |
| M1 | Contracts | 4 weeks | All contracts + interfaces implemented; 100% branch coverage on `SeasonMine`; invariant suite (doc 05 §4.3) green for 10M runs; economic simulation notebook delivered |
| M2 | App + indexer (parallel with M1 from week 2) | 5 weeks | All screens; Anvil time-warp e2e passes a full season; parity test green |
| M3 | Audit + fixes | 3–4 weeks | External audit report, all high/medium fixed and re-reviewed; bug bounty live |
| M4 | Testnet seasons | 2 weeks + 1 week analysis | Two public seasons on Robinhood Chain testnet with test stock tokens: one sized to run ~1 day, one sized to run ~1 week; ≥ 200 wallets; no invariant violations; retro doc |
| M5 | Mainnet season 1 | 1 week | Funded, params published, run (≤ 6h), redeemed; metrics in PRD §12 reported |

Total ≈ 14–16 weeks to season 1.

## 2. Team

| Role | FTE | Notes |
|---|---|---|
| Product / game design | 1 | owns params, economy sim, UX beats |
| Solidity engineer | 1.5 | contracts, tests, audit liaison |
| Frontend engineer | 2 | app, indexer, ops scripts |
| Designer | 1 | mine visuals, motion, brand |
| BD / legal liaison | 0.5 | Stock Token access, counsel |
| Ops / community | 0.5 | season running, support |

## 3. Testing strategy

- **Unit + fuzz (Foundry)**: every function; fuzz on stake amounts, tiers, timestamps.
- **Invariant tests**: handlers for activate/upgrade/overclock/claim/withdraw with time warps; assert
  doc 05 §4.3 invariants.
- **Scenario tests**: the worked example in doc 03 §7 reproduced to the fragment; late entrant; idle
  mine (`totalHash == 0`) then resume; overclock bought one second before a shift ends; 32 shifts crossed
  in a single `poke()`; the same season replayed at 6-hour, 1-day and 3-week paces yielding identical
  fragment distributions; exit mid-shift; fail-safe close mid-block; claim ordering; pause > grace.
- **Differential fuzz**: random action traces executed against `SeasonMine` and replayed through the
  Python reference (`sim.diff`); ≥ 100k traces with zero mismatches before audit.
- **Static analysis**: slither, findings triaged in `docs/AUDIT-PACKAGE.md`.
- **Economic simulation**: agent-based Python model of N players with strategies (early GPU maxer,
  finale overclocker, passive LP, early exiter) to tune params, pool sizing and difficulty sizing;
  outputs burn, share distribution, Gini of rewards, and season duration distribution across
  participation scenarios.
- **App**: Playwright full season on Anvil; parity test; reduced-motion audit.
- **Anvil dry run and testnet season** as dress rehearsals for the ops scripts, keeper, alerting and
  the pause/cancel procedure (`docs/RUNBOOK.md`).

## 4. Launch checklist (season 1)

- [ ] Params JSON published with hash before `openTime` (at creation for a season that opens at once)
- [ ] `SeasonFactory.create` executed and contracts verified on explorer
- [ ] Vault funded; `phase() == PreOpen`; app shows pool and USD value
- [ ] Eligibility adapter tested with at least one known-eligible and one ineligible wallet
- [ ] Oracle feeds live and within staleness bounds
- [ ] Difficulty sized from the previous season's hash and the simulation; planned pace and cap published
- [ ] Keeper running (`keeper.ts`); alerting running (`watch.ts`); on-call rota sized to the estimated duration, extendable
- [ ] Terms, "how rewards work" page, and geo-fence live
- [ ] Pause key holders and procedure documented; cancellation rehearsal done on testnet
- [ ] Post-close plan: withdraw comms, redemption reminders at day 1, 7, 25 after close; sweep date

## 5. Post-season review

Within one week of close: metrics vs PRD §12 (including actual vs planned duration and exit rate),
param and difficulty-sizing change proposals, incident list, player feedback summary, decision on v1.1
items (rig NFTs, fragment transfers, browser boost, fragment roll-over).
