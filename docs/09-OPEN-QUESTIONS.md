# Open questions

Decisions needed before or during M0. Each has a recommended default so the build is not blocked.

| # | Question | Options | Recommended default | Needed by |
|---|---|---|---|---|
| Q1 | Which tokenized stocks are the prize? | (a) Robinhood Stock Tokens with vault allowlisting via partnership; (b) permissionless issuer (xStocks/Ondo) if on Robinhood Chain; (c) USD-only prize | Pursue (a) and (b) in parallel; ship season 1 with whichever is executable; (c) is fallback | M0 |
| Q2 | Should fragments be transferable? | Soulbound v1 / transferable | Soulbound v1; revisit after counsel | M0 |
| Q3 | LP pair and DEX | RIG/USDC or RIG/ETH; which DEX exists | RIG/USDC on the canonical v2-style DEX; defer LP if only v3 | M0 |
| Q4 | Cash-out for ineligible players | USDC at oracle price / RIG at oracle price / none | USDC | M0 |
| Q5 | Activation fee | 0 / 1% / 2% | 1% to treasury | M1 |
| Q6 | Rigs as ERC-721 | v1 / v1.1 | v1.1 | M1 |
| Q7 | Upgrade burn split | 100% burn / 70% burn + 30% treasury | 100% burn (as specified) | M1 |
| Q8 | Pre-open window length | 24h / 48h / 72h | 48h (matches param-publication rule) | M1 |
| Q9 | Emission when `totalHash == 0` | unminted (stay in vault) / roll into next block | unminted | M1 |
| Q10 | Pause grace period | 2h / 6h / 12h | 6h | M1 |
| Q11 | Unclaimed fragments after window | worthless / roll to next season at discount | worthless in v1; announce roll-over policy for v1.1 | M3 |
| Q12 | "Browser boost" mini-game | never / v1.1 experiment | v1.1 experiment, capped at 5% | post season 1 |
| Q13 | Governance of season params and treasury | multisig / token vote | 3-of-5 multisig for seasons 1–3 | M0 |
| Q14 | Oracle provider on Robinhood Chain | Pyth / Chainlink / issuer NAV feed | Whichever publishes the underlyings; Pyth likely on an Orbit chain | M0 |
