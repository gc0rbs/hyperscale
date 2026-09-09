# Heat and overclocking

Heat is a per-rig gauge from 0 to 100. It exists to make overclocking a decision instead of a button you hold down.

## How heat moves

| Event | Heat change (by cooling tier 0 / 1 / 2 / 3) |
| --- | --- |
| You buy an overclock | +40 / +30 / +22 / +15 |
| A shift ends | −10 / −18 / −26 / −36 (never below 0) |

An overclock that would push heat above 100 reverts. Heat never blocks anything else: claiming, exiting, GPU and cooling purchases all work at any heat.

## Worked rhythm

A rig with cooling tier 2 wants three overclocks running: 3 × 22 = 66 heat. Every shift end drains 26. To keep three going the player re-buys as they lapse, roughly one overclock per shift on average, which is what "about 2.4 sustainable per two shifts" in the cooling table means. Cooling tier 3 (15 heat each, 36 drained per shift) can keep all three running continuously.

With no cooling, three overclocks cost 120 heat, which is impossible. Two cost 80, and the rig then drains only 10 per shift, so it will be several shifts before another fits. That is the intended trade: cooling is what you buy to overclock repeatedly.

## When to overclock

* **Block 4.** It holds 40% of the season's value for 30% of the work, so a unit of hashrate there earns the most fragments. Expect the whole mine to overclock in the finale, which shortens it.
* **When you are about to leave.** An overclock covers a fixed slice of the mine at a fixed cost. If you will not be around to re-buy, one burst before you go is fine.
* **Not when a GPU tier still pays.** Early in a season a permanent tier covers more work per $VRAM burned than a burst does.

## Long-haul mode

If the estimated time to the next shift is over about two hours, the mine page switches to a calmer layout: the hash stream is hidden, the ETA is large, GPU and cooling are promoted over overclocks, and notifications are offered. Same game, different arrangement, because re-buying overclocks every shift is not sensible when a shift takes a day.
