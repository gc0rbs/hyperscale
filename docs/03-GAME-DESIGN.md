# Game design – rigs, upgrades, heat, shifts, reward blocks

All numbers are the v1 defaults from `specs/params/season-default.json`. They are parameters, not
constants. The structure below is fixed by the contracts.

The game's clock is **mine progress**, measured in work (hash-seconds). Wall-clock durations appear in
this doc only as illustrations "at the planned pace", i.e. the participation the operator sized the
season for. Doc 02 §5 explains why.

## 1. Season structure

| Phase | Starts | Ends | Allowed |
|---|---|---|---|
| Funding | deployment | vault funded | operator funds the Stock Token pool |
| PreOpen | funded | `openTime` | activate rigs, buy GPU / cooling (no overclocks, no work) |
| Open – Block 1 | `openTime` | block 1 found (work = `D_1`) | everything; mines NVDAx |
| Open – Block 2 | block 1 found | block 2 found | block 1 claimable; mines TSLAx |
| Open – Block 3 | block 2 found | block 3 found | blocks 1–2 claimable; mines AAPLx |
| Open – Block 4 | block 3 found | block 4 found = **close** | blocks 1–3 claimable; mines SPYx |
| Closed / Redemption | close | close + 30 days | withdraw, claim block 4, redeem, cash out |
| Swept | close + 30 days | – | operator sweeps unclaimed assets per doc 04 |

Each block is divided into **8 shifts** of equal work (`D_b / 8`). Shifts are the heartbeat:
overclocks expire and heat decays at shift ends. A season is 32 shifts.

`openTime`, stocks, pools and difficulties are fixed at deployment and shown in the app at least 48h
ahead, together with the planned pace ("sized for ~24h at 10M hash").

**Fail-safe.** `maxDuration` (default 30 days) closes the mine regardless of progress so stakes are
never locked indefinitely. It is not part of the game and the app never shows it as an end date.

## 2. Rigs

A rig is one deposit. Players can own many rigs.

| Attribute | Set by | Notes |
|---|---|---|
| `asset` | activation | RIG or the season's LP token |
| `amount` | activation | returned in full at close, or minus 3% on early exit |
| `W` stake weight | activation | `amount` (RIG) or `amount × lpWeightPerToken` (LP). Min 100 RIG-equivalent. Immutable. |
| `gpuTier` 0–5 | upgrades | permanent for the season |
| `coolingTier` 0–3 | upgrades | permanent for the season |
| `heat` 0–100 | overclocks / shift ends | decays at each shift end |
| `activeOc` 0–3 | overclocks | all expire together at `ocExpiryShift` |

Why stake is immutable: upgrade costs are a percentage of `W`. If stake could be added later, a player
would buy every tier on a tiny rig and then top it up. Opening a second rig is the intended way to add
capital.

**Early exit.** `exit(rigId)` at any time while open: the rig stops, the deposit returns minus a 3%
fee (to treasury), earned fragments stay claimable, upgrades are lost. This exists because the season
has no fixed end; a player must always be able to leave.

## 3. Hashrate

```
gpuMult(g)   = 1 + 0.20 × g                 g ∈ 0..5   → 1.0x … 2.0x
H_base       = W × gpuMult(gpuTier)
H_oc         = H_base × 0.50 × activeOc     activeOc ∈ 0..3 → +0% … +150%
H            = H_base + H_oc                 max 2.0 × 2.5 = 5.0 × W
```

Multipliers are stored in basis points; the contract does integer arithmetic.

## 4. Work and pay

```
work(rig, dt)  = H × dt                              hash-seconds
r_b            = S_b / D_b                            fragments per hash-second, fixed per block
earned(rig,dt) = H × dt × r_b                         independent of other rigs
block b found when Σ_rigs work in block b == D_b      then Σ earned == S_b exactly
```

The UI shows `r_b × H` as "fragments per second" and it does not move when someone else joins. What
moves is the **ETA**: `remainingWork / totalHash`.

## 5. Upgrades (burn RIG)

Costs are a percentage of the rig's stake weight so a rig of any size faces the same *relative*
price. A rig staked with LP still pays upgrades in RIG from the wallet.

### 5.1 GPU

| Tier | Multiplier | Cost to reach (of `W`) | Cumulative |
|---|---|---|---|
| 0 | 1.0x | – | 0% |
| 1 | 1.2x | 4% | 4% |
| 2 | 1.4x | 6% | 10% |
| 3 | 1.6x | 9% | 19% |
| 4 | 1.8x | 13% | 32% |
| 5 | 2.0x | 18% | 50% |

A tier bought in PreOpen boosts 100% of the season's work; the same tier bought at 75% progress boosts
25%. The UI shows "boost covers X% of the mine" next to the price, and the equivalent fragments at the
current pay rate.

### 5.2 Cooling

| Tier | Heat per overclock | Heat removed at each shift end | Cost (of `W`) | Cumulative | Sustainable overclocks (per 2 shifts) |
|---|---|---|---|---|---|
| 0 | 40 | 10 | – | 0% | ~0.5 |
| 1 | 30 | 18 | 3% | 3% | ~1.2 |
| 2 | 22 | 26 | 5% | 8% | ~2.4 |
| 3 | 15 | 36 | 8% | 16% | 3 (continuous) |

### 5.3 Overclock

- Cost: 2% of `W` per overclock, burned.
- Effect: `+50%` of `H_base` per active overclock. Up to 3 active (+150%).
- Duration: active until the end of the **next** shift. Bought at the very start of a shift it covers
  ~2 shifts (1/16 of the season); bought at the end of a shift it covers ~1 shift. Buying another
  overclock refreshes the expiry of all active ones, so a player who keeps 3 running re-buys as they
  lapse.
- Heat: `+heatPerOc[coolingTier]`; reverts if heat would exceed 100. Heat drops by
  `coolPerShift[coolingTier]` at every shift end (floored at 0).
- Not available in PreOpen.

The tradeoff triangle: **GPU** = permanent multiplier, best bought early; **cooling** = enables
continuous overclocking, best for players who intend to play the whole mine; **overclock** =
pay-as-you-go burst, best late when nothing else has enough remaining work to pay off.

Because shifts are progress-based, an overclock buys the same *fraction of the mine* whether the
season is running fast or slow. What varies is how often the player has to come back to re-buy in
wall-clock terms, which the ETA makes visible.

## 6. Reward blocks

| Block | Stock | Share of pool value | Share of total difficulty | Example pool (season 1) |
|---|---|---|---|---|
| 1 | NVDAx | 15% | 20% | 5.0 NVDAx |
| 2 | TSLAx | 20% | 25% | 6.0 TSLAx |
| 3 | AAPLx | 25% | 25% | 10.0 AAPLx |
| 4 | SPYx | 40% | 30% | 6.0 SPYx |

Pool value escalates so the finale is the richest per unit of work (40% of value for 30% of work),
which rewards staying and makes block 4 the natural "everyone overclocks" moment.

`FRAG_PER_TOKEN = 1,000,000`: one Stock Token is one million fragments. Fragments are whole units; the
accumulator keeps 18 extra decimals internally and rounds down at claim.

### Difficulty at the planned pace

The operator sizes `D_total` as `expectedTotalHash × plannedSeconds`. Season 1 default: sized for
10,000,000 hash (≈ 7M RIG-equivalent staked at an average 1.4x multiplier) over 24 hours:

```
D_total = 10,000,000 × 86,400 = 8.64e11 hash-seconds
D_1..4  = 20% / 25% / 25% / 30% of D_total
```

| Actual average total hash | Season length |
|---|---|
| 40M (4× planned) | ~6 hours |
| 20M (2×) | ~12 hours |
| 10M (planned) | ~24 hours |
| 5M (½) | ~2 days |
| 2M (⅕) | ~5 days |
| 1M (⅒) | ~10 days |
| 0.33M (below fail-safe threshold) | closes at the 30-day fail-safe with block 4 partly mined |

The game is identical in every row; only the ETA differs.

### Claiming
- Any found block can be claimed by the rig owner at any time; unclaimed fragments never expire inside
  the mine, but redemption has a window.
- `claimAll(rigId)` claims every found block in one tx.

## 7. Worked example

Season pool and difficulties as above (`D_1 = 1.728e11`). Three players, all activate in PreOpen.

| Player | Stake | `W` | Upgrades | `H_base` | Overclocks | Burned |
|---|---|---|---|---|---|---|
| Ann | 5,000,000 RIG | 5,000,000 | GPU 2 | 7,000,000 | none | 500,000 RIG |
| Bo | 2,000,000 RIG-equiv LP | 2,500,000 (×1.25) | GPU 3, cooling 3 | 4,000,000 | keeps 3 running all block (re-buys every ~2 shifts) | 475,000 + 400,000 + 12 × 50,000 = 1,475,000 RIG |
| Cy | 2,500,000 RIG | 2,500,000 | none | 2,500,000 | none | 0 |

Block 1: Bo's hash with 3 overclocks = 4,000,000 + 6,000,000 = 10,000,000. Total = 19,500,000.

- Duration of block 1: `1.728e11 / 19.5e6 ≈ 8,862 s ≈ 2h 28m` (the planned pace assumed 10M hash, so
  this mine runs about twice as fast as sized). Each shift ≈ 18.5 min, so Bo re-buys 3 overclocks about
  every 37 min: ~4 rounds, 12 overclocks.
- Pay rate `r_1 = 5,000,000 fragments / 1.728e11 = 2.894e-5` fragments per hash-second.
- Ann: `7,000,000 × 8,862 × 2.894e-5 ≈ 1,794,872` fragments = 1.795 NVDAx. (Equivalently `5.0 × 7/19.5`.)
- Bo: `10,000,000 × 8,862 × 2.894e-5 ≈ 2,564,103` = 2.564 NVDAx.
- Cy: ≈ 641,026 = 0.641 NVDAx.

Note what Ann sees in the UI: "202.6 fragments/s" from the moment the mine opens, and that number never
changes when Bo overclocks. What changes is the ETA on the block, which shortens.

Whether Bo's 1.475M RIG burn beat Ann's 0.5M depends on the RIG price versus the pool value; that is
the game. The app shows the break-even for every upgrade in RIG terms at the current pay rate.

## 8. UX beats

1. **Pre-open**: countdown to `openTime`, "rigs ready" state, GPU/cooling shop with "covers 100% of
   the mine", live TVL and the resulting *estimated season length*.
2. **Open**: block card shows stock, pool, progress bar, shift ticks, ETA. Fragment counter ticks at
   `r_b × H`.
3. **Shift end**: heat bars drop; expiring overclocks flash "re-buy"; the ETA re-computes.
4. **Block found**: confetti, claim button, next block card. Push notification (opt-in) since the
   moment is not on a schedule.
5. **Final shift of block 4**: "last overclocks" banner with pool value in USD.
6. **Close**: mine sealed animation; withdraw + claim; redemption instructions with eligibility state.
7. **Slow mine**: if ETA to the next block exceeds ~12h the UI switches to a calmer "long haul" layout
   that emphasises GPU/cooling over overclocks and offers notifications instead of asking players to
   watch.

## 9. Anti-patterns considered and rejected

- **In-season difficulty adjustment** (Bitcoin-style retargeting to hit a wall-clock pace): reintroduces
  the calendar and gives the operator a lever over a live game. Rejected; size difficulty up front and
  let duration float.
- **Random events / jackpots** need randomness; keep v1 deterministic.
- **Rig decay / maintenance fees**: moves burn from upgrades to taxes; punishes casual players.
- **Fixed-time overclocks ("+50% for one hour")**: worth wildly different fractions of the mine at
  different paces. Everything is priced in shifts.
- **Fixed-cost upgrades**: free for whales relative to stake, unaffordable for small players.
  Percent-of-stake pricing throughout.
- **Block-finder bonus** (extra reward to whoever's transaction crosses the boundary): rewards
  transaction timing, invites bots. Boundaries are computed retroactively and nobody "finds" a block by
  sending a tx.
