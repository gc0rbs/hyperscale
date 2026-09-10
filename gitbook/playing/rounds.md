# Rounds: the hourly pot

Hyperscaler runs continuously. Every hour is a **round**. Your nodes keep working across rounds; you never re-enter.

## What happens every hour

1. **The round runs** for 60 minutes. Every active node does work equal to its throughput × seconds.
2. **The round closes** on the clock. The pot for that hour, one amount of each of the four stocks, is split among the nodes by the share of the hour's work each one did. Ten percent of the work earns ten percent of the pot.
3. **You have 15 minutes to claim.** One click, one transaction, all your nodes. It mints fragments of the four stocks into your wallet.
4. **Whatever is not claimed rolls into the next round's pot.** Miss the window and your share is not lost to the operator; it is added to the pot everyone mines next hour.

Only the latest closed round can be claimed. There is no catching up on older rounds; they have already rolled over.

## Where the pot comes from

The pots are funded by the trading fees on $VRAM: every trade on its Pons liquidity pool pays a fee, and the creator's share of that fee goes to a contract that collects it, swaps it into the four Stock Tokens on Robinhood Chain and adds them to the running round's pot every few minutes, so you can watch the pot grow during the hour. No person holds the fees on the way. The pot is locked the moment the round closes. The site shows the current pot and how much of it rolled over from the last round; a round with no fees pays only the rollover, and the site says so.

## Fragments

1,000,000 fragments of a stock equal one whole Stock Token of that stock. Fragments redeem at any time, in kind (whole or fractional, for eligible wallets) or as a USDG cash-out at the Chainlink price minus a 1% fee. There is no redemption deadline.

## Your stake

You stake $VRAM once per node. Leaving costs a 3% exit fee; the node's work in the round it leaves still counts. If the mine is ever halted, every deposit comes back in full with no fee.
