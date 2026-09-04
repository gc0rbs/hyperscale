# Overview: what can and cannot happen

This section is the plain-language version of the guarantees the contracts enforce, the powers that exist, and the things that can go wrong. It is written so you can decide how much to stake without reading Solidity. Where a statement is enforced by code we say so; where it depends on people, we say that too.

## Enforced by the contracts

| Guarantee | How |
| --- | --- |
| Your stake is returned in full at close | The mine holds deposits and nothing else; `withdraw` has no fee and no deadline |
| Nobody can change a season's rules after creation | No proxies, no setters, no difficulty adjustment. The contracts are immutable |
| The only admin power is pause | The treasury address can `pause` and `unpause`. It cannot mint, move stakes, change parameters or cancel directly |
| A block never pays more than its pool | `minted fragments ≤ pool × 1,000,000` is checked inside every claim |
| Your pay does not depend on other rigs | Earned = your hashrate × your seconds × a fixed rate per block |
| Nothing accrues by the clock alone | Zero hashrate earns zero, however long |
| Upgrade spend is burned, not collected | Every upgrade payment is a transfer to `0x…dEaD` |
| A pause cannot trap your stake | After the grace period (30 min default), `emergencyWithdraw` returns your deposit |
| Redemption is not at the operator's discretion | Any fragment holder can redeem or cash out inside the window; the operator cannot withdraw the pool, only sweep after the window |
| No randomness, no oracle in the mine | Outcomes are a deterministic function of stake and spend. The only oracle use is the cash-out price |

## Depends on people or external systems

| Item | Who | What if it fails |
| --- | --- | --- |
| Funding the pool before open | Operator | The season cannot open unfunded |
| Sizing the difficulty | Operator | A too-hard season ends at the cap with part of the pool unmined; that part rolls forward. A too-easy one is over in minutes |
| Using pause only for real incidents | Treasury key holder | A pause blocks your actions but not the clock. If it outlives the grace period you can withdraw and the season cancels, forfeiting unclaimed fragments |
| Chainlink price feeds | Chainlink | Cash-out pauses on a stale price. In-kind redemption is unaffected |
| Robinhood Stock Tokens | Robinhood | They are issued and priced by Robinhood; they carry no ownership or voting rights in the underlying company |
| The chain's sequencer | Robinhood Chain | If the chain stalls you cannot act; work keeps accruing by timestamp when it resumes |
| The geo-fence | The site | It is a front-end control. Eligibility is your responsibility under the terms |

## What you can lose

* **Every $RIG you burn on upgrades**, in all cases.
* **The early-exit fee** (3% default) if you leave before close.
* **Unclaimed fragments**, if a season is cancelled after an over-long pause, or if you do not redeem inside the 30-day window.
* **Value**, because $RIG and the Stock Tokens are volatile and the fragments you earn are worth whatever the stock is worth when you redeem.

Read the rest of this section for each point in detail.
