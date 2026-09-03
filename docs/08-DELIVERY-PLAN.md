# Delivery plan

## 1. Milestones

| M | Name | Duration | Exit criteria |
|---|---|---|---|
| M0 | Discovery | 2 weeks | All assumptions in PRD §10 verified or replanned; Stock Token access path decided (doc 09 Q1); counsel engaged; params v1 frozen |
| M1 | Contracts | 4 weeks | All contracts + interfaces implemented; 100% branch coverage on `SeasonMine`; invariant suite (doc 05 §4.3) green for 10M runs; economic simulation notebook delivered |
| M2 | App + indexer (parallel with M1 from week 2) | 5 weeks | All screens; Anvil time-warp e2e passes a full season; parity test green |
| M3 | Audit + fixes | 3–4 weeks | External audit report, all high/medium fixed and re-reviewed; bug bounty live |
| M4 | Testnet season | 1 week + 1 week analysis | Public 24h season on Robinhood Chain testnet with test stock tokens; ≥ 200 wallets; no invariant violations; retro doc |
| M5 | Mainnet season 1 | 1 week | Funded, published 48h ahead, run, redeemed; metrics in PRD §12 reported |

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
- **Scenario tests**: the worked example in doc 03 §6 reproduced to the fragment; late entrant;
  `totalHash == 0` window; overclock at boundary minus 1 second; claim ordering; pause > grace.
- **Economic simulation**: agent-based Python model of N players with strategies (early GPU maxer,
  finale overclocker, passive LP) to tune params and pool sizing; outputs burn, share distribution,
  Gini of rewards.
- **App**: Playwright full season on Anvil; parity test; reduced-motion audit.
- **Testnet season** as dress rehearsal for ops scripts and alerting.

## 4. Launch checklist (season 1)

- [ ] Params JSON published with hash, ≥ 48h before `openTime`
- [ ] `SeasonFactory.create` executed and contracts verified on explorer
- [ ] Vault funded; `phase() == PreOpen`; app shows pool and USD value
- [ ] Eligibility adapter tested with at least one known-eligible and one ineligible wallet
- [ ] Oracle feeds live and within staleness bounds
- [ ] Alerting running (`watch.ts`); on-call rota for the 24h
- [ ] Terms, "how rewards work" page, and geo-fence live
- [ ] Pause key holders and procedure documented; cancellation rehearsal done on testnet
- [ ] Post-close plan: withdraw comms, redemption reminders at day 1, 7, 25; sweep date

## 5. Post-season review

Within one week of close: metrics vs PRD §12, param change proposals, incident list, player feedback
summary, decision on v1.1 items (rig NFTs, fragment transfers, browser boost).
