# Open questions

Decisions needed before or during M0. Each has a recommended default so the build is not blocked.

| # | Question | Options | Recommended default | Needed by |
|---|---|---|---|---|
| Q1 | Which tokenized stocks are the prize? | (a) Robinhood Stock Tokens with vault allowlisting via partnership; (b) permissionless issuer (xStocks/Ondo) if on Robinhood Chain; (c) USD-only prize | Pursue (a) and (b) in parallel; ship season 1 with whichever is executable; (c) is fallback | M0 |
| Q2 | Should fragments be transferable? | Soulbound v1 / transferable | Soulbound v1; revisit after counsel | M0 |
| Q3 | LP pair and DEX | RIG/USDC or RIG/ETH; which DEX exists | RIG/USDC on the canonical v2-style DEX; defer LP if only v3 | M0 |
| Q4 | Cash-out for ineligible players | USDC at oracle price / RIG at oracle price / none | USDC | M0 |
| Q5 | How is difficulty sized for season 1 with no history? | From LBP participation; from a public pre-commit signal; conservative (long) sizing | Conservative: size for the *lower* end of expected hash so the mine runs 1–3 days rather than 3 hours; PreOpen TVL preview published | M0 |
| Q6 | Shifts per block | 4 / 8 / 12 | 8 (32 per season) | M1 |
| Q7 | Overclock span | end of current shift / end of next shift / fixed work amount per rig | end of next shift (simple global expiry buckets) | M1 |
| Q8 | Early exit fee | 0 / 3% / 5%; forfeit unclaimed? | 3%, keep unclaimed | M1 |
| Q9 | Cap (`maxDuration`) | per season; multiple of planned pace | **Decided 2026-09-04**: 2× planned pace, ≥ 1h; seasons target ≤ 6h. A capped season is a normal ending; remainder rolls forward | done |
| Q10 | Activation fee | 0 / 1% / 2% | 1% to treasury | M1 |
| Q11 | Rigs as ERC-721 | v1 / v1.1 | v1.1 | M1 |
| Q12 | Upgrade burn split | 100% burn / 70% burn + 30% treasury | 100% burn (as specified) | M1 |
| Q13 | Pre-open window length | 0 / hours / days | **Decided 2026-09-04**: per season, zero allowed (open at creation) | done |
| Q14 | Pause grace period | 30 min / 2h / 6h | 30 min (seasons last hours) | M1 |
| Q15 | Unclaimed fragments after window | worthless / roll to next season at discount | worthless in v1; announce roll-over policy for v1.1 | M3 |
| Q16 | "Browser boost" mini-game | never / v1.1 experiment | v1.1 experiment, capped at 5% | post season 1 |
| Q17 | Governance of season params and treasury | multisig / token vote | 3-of-5 multisig for seasons 1–3 | M0 |
| Q18 | Oracle provider on Robinhood Chain | Pyth / Chainlink / issuer NAV feed | Whichever publishes the underlyings; Pyth likely on an Orbit chain | M0 |
| Q19 | Who runs the `poke()` keeper and what if it stops? | ops cron / anyone / none | Ops cron; correctness never depends on it; app also triggers it | M2 |
| Q20 | Adopt the simulation's parameter changes? (pool sized to ρ≈0.4, cheaper GPU/cooling tiers, LP bonus review; docs/SIM-REPORT.md §7) | adopt all / adopt costs only / keep defaults | Adopt all before season 1; re-run the sim after | M3 |
