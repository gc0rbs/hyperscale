# Upgrades

Upgrades are the only way $RIG leaves your hands permanently. Every upgrade is priced as a percentage of your rig's stake, so a rig of any size faces the same relative price, and every upgrade payment is sent to the burn address `0x…dEaD`. It cannot be recovered by anyone, including the operator, including if the season is cancelled.

{% hint style="warning" %}
Before every purchase the app shows: the $RIG that will be burned, the hashrate you will have afterwards, and the fraction of the mine's remaining work the purchase covers. Upgrades do not carry over to the next season.
{% endhint %}

## GPU tiers: permanent multiplier

| Tier | Multiplier | Cost to reach (of stake) | Cumulative |
| --- | --- | --- | --- |
| 0 | 1.0× | | 0% |
| 1 | 1.2× | 4% | 4% |
| 2 | 1.4× | 6% | 10% |
| 3 | 1.6× | 9% | 19% |
| 4 | 1.8× | 13% | 32% |
| 5 | 2.0× | 18% | 50% |

Tiers must be bought in order. A tier bought in pre-open boosts 100% of the season's work; the same tier bought when the mine is 75% done boosts 25%. The app shows "covers X% of the mine" next to the price and the equivalent fragments at the current pay rate, so you can judge whether it pays back.

## Cooling tiers: sustain overclocks

| Tier | Heat per overclock | Heat removed at each shift end | Cost (of stake) | Cumulative | Overclocks sustainable per two shifts |
| --- | --- | --- | --- | --- | --- |
| 0 | 40 | 10 | | 0% | about 0.5 |
| 1 | 30 | 18 | 3% | 3% | about 1.2 |
| 2 | 22 | 26 | 5% | 8% | about 2.4 |
| 3 | 15 | 36 | 8% | 16% | 3, continuously |

Cooling does not raise hashrate by itself. It lowers the heat each overclock adds and raises the heat that drains at every shift end, which decides how many overclocks you can keep running.

## Overclocks: pay-as-you-go burst

* **Cost:** 2% of stake per overclock, burned.
* **Effect:** +50% of base hashrate per active overclock, up to three (+150%).
* **Duration:** until the end of the *next* shift. Bought at the very start of a shift it covers about two shifts, one sixteenth of the season. Bought at the end of a shift it covers about one.
* **Refresh:** buying another overclock resets the expiry of all your active ones, so a player keeping three running re-buys as they lapse.
* **Heat:** adds your cooling tier's heat per overclock. The purchase reverts if heat would exceed 100.
* Not available in pre-open.

Because shifts are progress-based, an overclock buys the same fraction of the mine whether the season is running fast or slow. What varies is how often you have to come back in wall-clock terms.

## Which one, when

| Upgrade | Best when | Why |
| --- | --- | --- |
| GPU | Early, ideally pre-open | Permanent, covers the most remaining work |
| Cooling | Early, if you intend to overclock through the whole mine | Enables continuous overclocking |
| Overclock | Late, especially block 4 | Nothing permanent has enough remaining work left to pay off, and block 4 carries 40% of the value |

An engaged player typically burns 15 to 40% of a rig's stake over a season. The theoretical maximum, every tier plus three overclocks for all 32 shifts, is about 160%.
