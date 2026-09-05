# Redeeming

After close, the **Redeem** page turns fragments into stock or cash. The window is **30 days** from close.

## Two ways

| | Redeem in kind | Cash out |
| --- | --- | --- |
| You receive | The Stock Token itself (NVDA, MU, SNDK or QQQ) | USDG |
| Rate | 1,000,000 fragments = 1 Stock Token | Chainlink USD price of the stock, minus a 1% fee |
| Depends on | An eligibility check (open on mainnet) | A fresh oracle price (at most 26 hours old) and the vault's USDG reserve |
| Fee | None | 1% (default) |

Both burn the fragments. Both are available for any block whose fragments you hold, at any time inside the window. The app shows the eligibility result and the current oracle price before you confirm.

## In kind

Robinhood Stock Tokens are plain ERC-20 tokens with no transfer restriction on chain, so on mainnet the eligibility adapter allows every wallet. The legal restriction (no US, CA, UK, CH persons) is enforced by the site and the terms, not by the vault. The Stock Token arrives in your wallet like any other ERC-20 and tracks the price of the underlying share, including corporate actions through its multiplier.

## Cash out

The vault holds a USDG reserve funded before the season opened, sized at 50% of the pool's value (default). Cash-out pays the oracle price minus the fee from that reserve. If the reserve runs low, cash-out for the remaining fragments is unavailable and in-kind redemption is the way out; the reserve cannot be topped up mid-season by design.

If the Chainlink feed has not updated in 26 hours (for example over a long market closure), cash-out pauses until it does. In-kind redemption never depends on the oracle. See [Oracle and cash-out](../safety/oracle-and-cash-out.md).

## After the window

Thirty days after close, anyone can call `sweep`, which moves everything left in the vault, unredeemed Stock Tokens, the remaining USDG and any part of the pool that was never mined, to the treasury. Fragments still in wallets stay there but can no longer be redeemed from that season.

{% hint style="warning" %}
Redeem before the window closes. The app shows the deadline on the Redeem page and the closed screen; there is no extension.
{% endhint %}
