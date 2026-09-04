# The cap

Every season has a hard cap on wall-clock length, `maxDuration`, fixed at creation and shown in the app from the first second as **the latest possible end**. The default is twice the planned pace: a season sized for three hours has a six-hour cap. The factory refuses caps under one hour.

## What the cap is for

Blocks are found by work, so a season with far less hashrate than planned would otherwise run for days. The cap turns a mis-sized season into a short one instead of a stuck one.

## What happens at the cap

If block 4 has not been found when the cap is reached, the season closes at that instant, exactly like a block-4 close:

* blocks already found are paid in full and claimable,
* the block that was running pays what was mined in it, at its normal rate, to the rigs that did the work,
* the unmined part of the pool is swept after the redemption window and funds a later season,
* stakes are returned in full,
* the 30-day redemption window starts.

## What the cap is not

* It is **not** a schedule. Nothing you earn depends on it, and reaching it does not pay anyone anything extra.
* It is **not** adjustable. Nobody can extend a season.
* It is **not** the expected end. The expected end is the ETA, and the app labels it as an estimate.

## Judging a season by its cap

The app shows the planned pace ("sized for about 3h at 10M hash") and the cap side by side. If the total hash is well under the planned figure early on, the ETA will show the season heading for the cap. That is useful information: the blocks that will be found still pay normally, so the question is which blocks your rig will work through, not whether it gets paid.
