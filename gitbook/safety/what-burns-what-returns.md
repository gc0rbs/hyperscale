# What burns, what returns

| Money | Returns? | When | Notes |
| --- | --- | --- | --- |
| Stake | **Yes, 100%** | At close, via `withdraw` | Or via `emergencyWithdraw` after an over-long pause |
| Stake on early exit | Yes, minus 3% (default) | Immediately, via `exit` | The fee goes to the treasury |
| Activation fee (1% of stake, default) | No | Charged on top at activation | Goes to the treasury |
| GPU tiers (4 to 18% of stake each) | **No, burned** | | Sent to `0x…dEaD` |
| Cooling tiers (3 to 8% of stake each) | **No, burned** | | Sent to `0x…dEaD` |
| Overclocks (2% of stake each) | **No, burned** | | Sent to `0x…dEaD` |
| Cash-out fee (1% of the USDG value, default) | No | At cash-out | Goes to the treasury |

## Why burn instead of collect

The upgrade spend is the game's only sink and it goes to an address nobody controls. $RIG has no burn function, so a burn is a transfer to the dead address; the nominal supply stays one billion while the circulating supply only goes down. You can verify every burn on the explorer as a transfer to `0x000000000000000000000000000000000000dEaD`.

## Burned means burned

Upgrades are non-refundable under every circumstance the contracts know about:

* if you exit early,
* if the season ends at the cap before your upgrade paid back,
* if the season is paused or cancelled,
* if the mine is over in ten minutes because it was mis-sized.

The app repeats this before every purchase, with the price and the fraction of the mine the purchase covers. Treat every burn as a bet on how much of the remaining mine your rig will work through.

## Where the treasury's money goes

The treasury receives activation fees, exit fees, cash-out fees and whatever is swept from the vault after the redemption window. It is the operator's wallet, and it pays for the next season's pool. Prize pools are bought with treasury income and outside funding, not from a token allocation.
