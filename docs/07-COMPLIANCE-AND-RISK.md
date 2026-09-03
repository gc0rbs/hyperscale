# Compliance and risk

This is an engineering-side inventory of what counsel must review and what the design does to reduce
exposure. It is not legal advice and none of it is settled.

## 1. Stock Tokens are regulated instruments

Robinhood's Stock Tokens are marketed as derivatives that track equities and are offered to eligible
customers (EU at launch) after KYC. On-chain they are expected to be ERC-20s with transfer restrictions
that only allow movement between allowlisted addresses. Consequences for this product:

| Issue | Design response |
|---|---|
| A contract (`RedemptionVault`) must hold and transfer Stock Tokens | Requires the vault address to be allowlisted by the issuer. **Hard dependency** on a Robinhood relationship, or on using a permissionless tokenized-stock issuer (e.g. xStocks by Backed, Ondo Global Markets tokens) for season 1 if they are deployed on Robinhood Chain. Decision in doc 09. |
| Only eligible wallets may receive Stock Tokens | `IEligibility` gate on `redeem`; everyone else uses `cashOut` for USDC. The app checks eligibility before the user enters the redeem flow. |
| Fragments are claims on Stock Tokens | Fragments are **non-transferable** in v1 (mint and burn only), so there is no secondary market in fragments and they look like a receipt, not a security. Enabling transfers is a one-line change but a separate legal decision. |
| Cash-out looks like the vault "selling" a derivative | Cash-out is settlement of a prize in USD at an oracle price, funded by a pre-set reserve. Counsel to confirm framing; alternative is to have only in-kind redemption and refund ineligible players' prize value in RIG. |

## 2. Is the game itself gambling / a lottery?

- No randomness in v1. Outcomes are a deterministic function of stake and spend. This is the strongest
  argument that it is a staking/rewards programme rather than a game of chance.
- Consideration (RIG burned) and prize (Stock Tokens) both exist; without chance, most lottery
  definitions are not met, but some jurisdictions regulate "prize competitions" anyway.
- Keep any future random events (doc 03 §8) behind a separate legal review.

## 3. $RIG

- Fixed-supply utility token with staking and burn utility; distribution method (LBP / fair launch)
  and team allocation need review under MiCA (EU) and US securities law. The app's geo-fencing list
  should mirror whatever counsel decides.
- No yield is promised; rewards depend on other players' behaviour and the prize pool.

## 4. Geo-fencing and access

- Front-end blocks configured jurisdictions via edge middleware (IP) plus a self-attestation on connect.
  Contracts are permissionless; this is a front-end control only and must be described as such.
- Terms of use and a plain-English "how rewards are computed" page are part of the launch checklist.

## 5. Consumer protection items

- Permanent close is prominent and repeated before every burn ("Upgrades are non-refundable; this mine
  closes when block 4 is found"). Duration is always shown as an estimate.
- Early exit and its fee are explained at activation; the fail-safe close is disclosed as a fail-safe.
- Break-even hints are labelled as estimates and never as returns.
- Redemption window (30 days) and sweep behaviour are shown at claim time.
- Pause/cancel path returns stakes; burned RIG is never refundable, which must be stated in terms.

## 6. Technical and operational risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Vault cannot be allowlisted for Stock Tokens | Medium | Blocks the core prize | Parallel path with a permissionless issuer; cash-only prize as last resort | Product / BD |
| 2 | Accounting bug over-mints fragments | Low | Vault insolvent for some redeemers | Invariant tests, audit, `mintedFragments[b] ≤ supply` hard check in `claim` | Contracts |
| 3 | Oracle staleness during cash-out | Medium | Wrong payouts | Staleness check (≤ 1h), pause cash-out only, in-kind unaffected | Contracts |
| 4 | Sequencer downtime during season | Low | Players cannot overclock/claim; work keeps accruing by timestamp | Documented; pause grace path; consider Arbitrum-style delayed-inbox awareness | Ops |
| 5 | RIG price crash mid-season | Medium | Pool becomes very generous; burn drops | Prize sizing rules, treasury policy; no in-season changes | Treasury |
| 6 | LP token is v3-style (NFT) | Medium | LP staking impossible as specced | Confirm DEX in discovery; defer LP to v1.1 | Eng |
| 7 | Whale dominates a season | Medium | Poor retention | Linear rewards mean no one is *excluded*; escalating block value; communicate share live | Product |
| 8 | Front-end geo-fence bypass | High | Regulatory | Accept as residual; contracts permissionless by design | Legal |
| 9 | Unclaimed prizes | Medium | Ops overhead | 30-day window, reminders, sweep policy | Ops |
| 10 | Difficulty badly mis-sized | Medium | Season far shorter or longer than planned | Sizing rules (doc 04 §5.2), PreOpen TVL preview, early exit, fail-safe close; no in-season adjustment by design | Product |
| 11 | Participation collapses mid-season | Low | Stakes idle for weeks | `exit` any time; fail-safe close returns stakes; comms | Ops |

## 7. Data and privacy

- No personal data stored by the app; wallet addresses only. PostHog configured without IP storage.
- Eligibility lists (if Merkle-based) contain addresses only and are published on-chain as a root.
