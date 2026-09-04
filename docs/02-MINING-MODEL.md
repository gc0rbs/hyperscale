# Mining model – how "mining" works, why difficulty replaces the clock, and why it is not browser mining

## 1. The questions

> Can this be browser mining? Or how does the mining work?
> It shouldn't be time-boxed. It needs to work just as well in a 1-day window as over a longer one.

Short answers:

- **Not browser mining.** Real hashing in the browser is technically possible on an EVM chain but
  rewards compute instead of stake, invites bots, and trips cryptojacking heuristics (§3).
- **Mining is virtual work.** A rig's hashrate is an on-chain number derived from stake and upgrades.
  Every second it is active it contributes `hashrate × 1s` of *work* (§4).
- **Blocks are found by work, not by time.** Each reward block has a difficulty in hash-seconds and a
  fixed pool. It pays a fixed number of fragments per unit of work, so it is found exactly when the
  pool is exhausted. A busy mine finishes in a day; a quiet one takes weeks. Nothing in the mechanics
  references a calendar (§5).

## 2. What "browser mining" would actually mean here

Robinhood Chain is a rollup (Arbitrum Orbit). Blocks are produced by a sequencer and settled to
Ethereum. There is no proof-of-work anywhere in the stack, so a browser cannot "mine the chain". The
only way to put real hashing in the game is a **mineable-token pattern** (ERC-918 / 0xBitcoin):

1. The contract publishes a `challenge` and a `target`.
2. Players search for a `nonce` such that `keccak256(challenge, minerAddress, nonce) < target`
   (in WASM or WebGPU in the browser).
3. A solution is submitted as a transaction; the contract verifies the hash, pays the reward, rotates
   the challenge and adjusts difficulty.

That is feasible. The problems are not technical.

## 3. Options compared

| | A. Real browser PoW (ERC-918 style) | B. Virtual work (stake-weighted) – **chosen** | C. Hybrid: B + bounded browser "boost" |
|---|---|---|---|
| Who wins | Whoever has the most compute. One rented GPU box out-hashes thousands of phones. Bots need no browser. | Whoever stakes more and spends RIG smarter. Exactly the "stake $RIG / burn $RIG" design. | Same as B, plus a small edge for players who show up. |
| Fits the spec | No. Stake becomes a gate, not the driver; upgrades would have to scale real difficulty, which cannot be enforced client-side. | Yes. | Yes, if the boost is capped so it never dominates stake. |
| Fairness / sybil | Poor. Compute is cheap to rent and impossible to attribute to a person. | Good. Rewards are pro rata to capital at risk; sybil splitting gains nothing. | Boost must be small enough that botting it is not worth it. |
| Cost to player | Battery, CPU, heat. Mobile browsers throttle background tabs; mining dies when the screen locks. | Gas for a handful of transactions. | Gas + optional light client work. |
| Platform risk | Chrome, Safari, ad-blockers and AV flag in-page hashing as **cryptojacking**. App-store review would reject a wrapper. | None. | Low if the work is tiny and opt-in. |
| Gas | One transaction per share found. Low difficulty floods the chain; high difficulty means most players never find a share. | Constant-time accounting; ~3–15 txs per season per player. | Adds one tx per boost claim. |
| Energy / optics | Burns electricity to produce nothing. Bad story for a Robinhood-adjacent product. | Zero. | Negligible. |
| Provable fairness | Hashing yes; difficulty adjustment and solution front-running have edge cases. | Yes: every reward is a deterministic function of on-chain state and timestamps. | Yes, with commit-reveal on the boost. |

## 4. How virtual work mining works (the chosen model)

1. **Stake weight `W`** – set once at rig activation. `W = amount` for RIG; `W = amount × lpWeightPerToken`
   for LP tokens (25% bonus on RIG-equivalent value; doc 04).
2. **Base hashrate** `H_base = W × gpuMult(gpuTier)`. GPU tiers are bought by burning RIG.
3. **Overclock hashrate** `H_oc = H_base × ocBoost × activeOverclocks`. Bought by burning RIG, expires at
   the end of the next *shift* (a slice of mine progress, §5), limited by heat (cooling tiers).
4. **Rig hashrate** `H = H_base + H_oc`. This is the number the UI animates.
5. **Work.** Over an interval of `dt` seconds the rig does `H × dt` work and the mine does
   `totalHash × dt`.
6. **Pay rate.** Block *b* has pool `S_b` fragments and difficulty `D_b` hash-seconds. It pays
   `r_b = S_b / D_b` fragments per hash-second, to every rig, regardless of what other rigs do.
7. **Found.** Block *b* is found the instant cumulative work in it reaches `D_b`. Because `totalHash`
   only changes at transactions and shift boundaries, the contract can compute that instant exactly and
   retroactively. Total fragments paid for the block are then exactly `S_b` (minus rounding dust).
8. **Unlock.** A found block's fragments are claimable. Claiming mints ERC-1155 fragments whose id is
   the block index.
9. **Close.** When block 4 is found the mine is closed forever; only `withdraw`, `claim`, `redeem`,
   `cashOut` work.

A useful way to describe it to players: *"Your rig earns a fixed number of fragments per hash-second.
Other miners don't dilute you; they decide how fast the mine runs out."* The two statements are the
same thing said from different angles: over a whole block your share is still `H_you / H_total`, but
the *duration* is what flexes, not the price of your work.

### What the browser does

- Reads rig state and global state from the RPC.
- Computes the same work formula locally to show fragments ticking up and the block's progress bar.
- Shows an **ETA** to the next shift, block and close from `remainingWork / totalHash`, labelled
  estimated, since anyone joining or overclocking changes it.
- Renders a hash-rate visualiser (a scrolling stream of pseudo-hashes from a seeded PRNG at a speed
  proportional to `H`). Purely cosmetic and labelled as such.
- Never sends anything except signed transactions.

## 5. Why difficulty instead of a clock

The first draft of this game fixed the season at 24 hours with four six-hour blocks. That has a hidden
dependency: every balance number (overclock length, heat decay, "hours of boost remaining", pool per
second) was a function of that duration, so the design could not survive a season that turned out to
last three days or three hours. The fix is to make **progress** the game's unit of time:

| Quantity | Time-boxed draft | Progress-based (current) |
|---|---|---|
| Block ends when | 6h elapsed | `D_b` hash-seconds of work accumulated |
| Emission | fixed per second, split pro rata | fixed per hash-second, paid to each rig |
| Overclock lasts | rest of the block | rest of this shift + the next shift (`2/shiftsPerBlock` of a block at most) |
| Heat decays | per block boundary | per shift boundary |
| "Boost remaining" on GPU | hours | % of total season work |
| Season length | 24h, always | `D_total / averageTotalHash`; whatever participation makes it |
| No miners | fragments wasted | mine pauses; nothing wasted |

Properties that fall out of this:

- **Pace-agnostic.** All balance numbers are ratios of work. A season with 100 rigs and a season with
  100,000 rigs play the same game at different speeds.
- **Joining speeds the mine up, it does not dilute income.** Each rig's fragments per second are fixed
  by its own hashrate. This is a much easier story to tell than "your share shrank because a whale
  showed up", and it removes the incentive to hide hashrate until the last minute.
- **Deterministic and cheap.** No oracle, no randomness, no keeper needed for correctness. A public
  `poke()` lets anyone advance the accounting; ops calls it once per shift so nobody pays for a long
  catch-up loop.
- **Idle is free.** With zero hashrate the mine stops; unmined pool stays in the vault.

Two things are still needed because participation is unknown in advance:

1. **Difficulty sizing.** The operator sets `D_total` from expected hashrate and a target pace
   (doc 04 §5). Under- or over-shooting changes duration, not fairness. **No in-season difficulty
   adjustment**: it would reintroduce the calendar and give the operator a lever over a live game.
2. **A fail-safe, not a schedule.** `maxDuration` (default 30× the planned pace, at least 14 days)
   closes the mine so stakes can never be locked forever if participation collapses. Players can also
   `exit` early for a small fee at any time. The UI never shows the fail-safe as an end date.

### Shifts

A shift is `1/shiftsPerBlock` of a block's difficulty (default 8 shifts per block, 32 per season). It
is the game's heartbeat: overclocks expire at shift ends, heat decays at shift ends, and the UI counts
shifts, not hours. At the planned pace a shift is about 45 minutes in a 24-hour season; if the mine
runs slow a shift is longer and every overclock covers proportionally more wall-clock time for the same
RIG, which keeps the economics identical in work terms.

## 6. Optional later: a bounded "browser boost" (option C)

If we want a *feeling* of active mining, v1.1 can add an opt-in mini-game that gives a small, capped
boost. Constraints that keep it honest:

- Boost ≤ 5% of `H_base`, so it never beats a single GPU tier and bots gain little.
- Work is a tiny client puzzle (find a nonce with 16 leading zero bits, ~50 ms on a phone) on a
  challenge derived from the rig id and the current shift, submitted via commit-reveal.
- One boost claim per rig per shift, so a season is ≤ 32 tiny transactions.
- Gas is the natural rate limiter.

Out of v1 scope: it adds a bot-able mechanic, and "rewards for compute" is a separate legal question
from "rewards for stake".

## 7. Decision

**Virtual work with work-based difficulty (option B) for v1.** All player advantage comes from stake
and RIG burned; duration comes from participation. Option C is a documented candidate for v1.1.
