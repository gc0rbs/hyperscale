# Game design – rigs, upgrades, heat, reward blocks

All numbers are the v1 defaults from `specs/params/season-default.json`. They are parameters, not
constants; a season can ship different values, but the structure below is fixed by the contracts.

## 1. Timeline

| Phase | Starts | Ends | Allowed |
|---|---|---|---|
| Funding | deployment | vault funded (`fund()` verified) | operator funds the Stock Token pool |
| PreOpen | funded | `T0` (open time) | activate rigs, buy GPU / cooling (no overclocks, no emission) |
| Open – Block 1 | `T0` | `T0 + 6h` | everything; block 1 mines NVDAx |
| Open – Block 2 | `T0 + 6h` | `T0 + 12h` | block 1 claimable; block 2 mines TSLAx |
| Open – Block 3 | `T0 + 12h` | `T0 + 18h` | blocks 1–2 claimable; block 3 mines AAPLx |
| Open – Block 4 | `T0 + 18h` | `T0 + 24h` (close) | blocks 1–3 claimable; block 4 mines SPYx |
| Closed / Redemption | close | close + 30 days | withdraw, claim block 4, redeem, cash out |
| Swept | close + 30 days | – | operator sweeps unclaimed assets per doc 04 |

`T0` and stocks per block are fixed at deployment and shown in the app at least 48h ahead.

## 2. Rigs

A rig is one deposit. Players can own many rigs.

| Attribute | Set by | Notes |
|---|---|---|
| `asset` | activation | RIG or the season's LP token |
| `amount` | activation | returned in full at close |
| `W` stake weight | activation | `amount` (RIG) or `amount × lpWeightPerToken` (LP). Min 100 RIG-equivalent. Immutable. |
| `gpuTier` 0–5 | upgrades | permanent for the season |
| `coolingTier` 0–3 | upgrades | permanent for the season |
| `heat` 0–100 | overclocks / block boundaries | decays at each boundary |
| `ocCount` | overclocks | overclocks bought in the current block, resets at boundary |

Why stake is immutable: upgrade costs are a percentage of `W`. If stake could be added later, a player
would buy every tier on a tiny rig and then top it up. Opening a second rig is the intended way to add
capital; its upgrades are bought at the right price.

## 3. Hashrate

```
gpuMult(g)   = 1 + 0.20 × g                 g ∈ 0..5   → 1.0x … 2.0x
H_base       = W × gpuMult(gpuTier)
H_oc         = H_base × 0.50 × ocCount      ocCount ∈ 0..3 → +0% … +150%
H            = H_base + H_oc                 max 2.0 × 2.5 = 5.0 × W
```

All multipliers are stored in basis points and the contract does the arithmetic in integers; the
formulas above are the intent.

## 4. Upgrades (burn RIG)

Costs are a percentage of the rig's stake weight so that a rig of any size faces the same *relative*
price, and a whale cannot buy a disproportionate edge by spending a fixed fee that is trivial to them.
A rig staked with LP still pays upgrades in RIG from the wallet.

### 4.1 GPU

| Tier | Multiplier | Cost to reach (of `W`) | Cumulative |
|---|---|---|---|
| 0 | 1.0x | – | 0% |
| 1 | 1.2x | 4% | 4% |
| 2 | 1.4x | 6% | 10% |
| 3 | 1.6x | 9% | 19% |
| 4 | 1.8x | 13% | 32% |
| 5 | 2.0x | 18% | 50% |

Buying early is the whole point: a tier bought in PreOpen boosts all 24 hours; the same tier bought in
block 4 boosts 6. The UI shows "hours of boost remaining" next to the price.

### 4.2 Cooling

| Tier | Heat per overclock | Heat removed at each block boundary | Cost (of `W`) | Cumulative |
|---|---|---|---|---|
| 0 | 40 | 20 | – | 0% |
| 1 | 30 | 35 | 3% | 3% |
| 2 | 22 | 50 | 5% | 8% |
| 3 | 15 | 70 | 8% | 16% |

### 4.3 Overclock

- Cost: 2.5% of `W` per overclock, burned.
- Effect: `+50%` of `H_base` for the rest of the current block. Up to 3 per block (+150%).
- Heat: `+heatPerOc[coolingTier]`; reverts if heat would exceed 100.
- Expires at the block boundary. Heat then drops by `coolPerBlock[coolingTier]` (floored at 0).
- Not available in PreOpen (nothing to boost).

Heat is what makes cooling matter. Worked out per cooling tier, assuming a player wants to overclock as
much as possible every block:

| Cooling | Block 1 | Block 2 | Block 3 | Block 4 | Total overclocks |
|---|---|---|---|---|---|
| 0 (40 heat, −20/boundary) | 2 (heat 80) | 1 (60→100) | 0 (80, no room) | 1 (60→100) | 4 |
| 1 (30, −35) | 3 (heat 90) | 1 (55→85) | 1 (50→80) | 1 (45→75) | 6 |
| 2 (22, −50) | 3 (heat 66) | 3 (16→82) | 3 (32→98) | 2 (48→92) | 11 |
| 3 (15, −70) | 3 (heat 45) | 3 (0→45) | 3 (0→45) | 3 (0→45) | 12 |

(The cooling-0 row: block 1 two overclocks → heat 80; boundary → 60; block 2 one overclock → 100;
boundary → 80; block 3 none possible; boundary → 60; block 4 one → 100. Four total.)

The design intent is a clear tradeoff triangle: **GPU** = permanent multiplier, best bought early;
**cooling** = enables late-game overclock spam, best for players who plan to play the whole 24h;
**overclock** = pay-as-you-go burst, best in the last block when nothing else has time to pay off.

## 5. Reward blocks

Each block is a separate pool with its own stock, so a rig's 24-hour output is a *basket*.

| Block | Hours | Stock | Share of pool value | Example pool (season 1) |
|---|---|---|---|---|
| 1 | 0–6 | NVDAx | 15% | 5.0 NVDAx |
| 2 | 6–12 | TSLAx | 20% | 6.0 TSLAx |
| 3 | 12–18 | AAPLx | 25% | 10.0 AAPLx |
| 4 | 18–24 | SPYx | 40% | 6.0 SPYx |

Escalating value rewards staying to the end, and block 4 is the natural "everyone overclocks" finale.
Pool value figures are illustrative; doc 04 §5 covers sizing.

`FRAG_PER_TOKEN = 1,000,000`: one Stock Token is one million fragments, so a rig holding 0.01% of the
mine in block 1 earns 500 NVDAx fragments (0.0005 NVDAx). Fragments are whole units; the accumulator
keeps 18 extra decimals internally and rounds down at claim.

Emission per second for a 5.0-token block: `5,000,000 / 21,600 ≈ 231.48` fragments/s, shared by all rigs.

### Claiming
- Any block whose end time has passed can be claimed by the rig owner; unclaimed fragments never expire
  inside the mine, but redemption has a window.
- `claimAll(rigId)` claims every unlocked block in one tx.

## 6. Worked example

Season pool as above. Three players, all activate in PreOpen. Total staked weight `W_total = 100,000`.

| Player | Stake | `W` | Upgrades | `H_base` | Overclocks | Total burned |
|---|---|---|---|---|---|---|
| Ann | 50,000 RIG | 50,000 | GPU 2 | 70,000 | none | 5,000 RIG |
| Bo | 20,000 RIG-equiv LP | 25,000 (×1.25 bonus) | GPU 3, cooling 2 | 40,000 | 3 per block (11 total, heat permitting) | 4,750 + 2,000 + 11×625 = 13,625 RIG |
| Cy | 25,000 RIG | 25,000 | none | 25,000 | 1 in block 4 | 625 RIG |

Block 1 (assume Bo overclocks 3× immediately): `H_Bo = 40,000 + 60,000 = 100,000`. Total hash =
70,000 + 100,000 + 25,000 = 195,000.

- Ann: 5.0 NVDAx × 70/195 = 1.795 NVDAx (1,794,871 fragments)
- Bo: 5.0 × 100/195 = 2.564 NVDAx
- Cy: 5.0 × 25/195 = 0.641 NVDAx

Bo burned 13,625 RIG to turn 20,000 RIG of LP into roughly 40% of a mine in which he holds 25% of the
weight. Whether that was worth it depends on the RIG price versus the pool value: that is the game, and
the app must show the break-even in RIG terms for every upgrade ("this upgrade pays off if the pool is
worth more than X RIG at current share").

## 7. UX beats

1. **Pre-open**: countdown, "rigs ready" state, GPU/cooling shop with "boost hours remaining = 24".
2. **Block start**: block card flips to the new stock, overclock buttons enable, heat bars reset partially.
3. **During block**: fragment counter ticks; a "your share" ring shows `H / totalHash` live; the ring
   shrinks when others overclock, which is the social pressure loop.
4. **Block unlock**: confetti, claim button, next block card.
5. **Final 30 minutes**: "last chance to overclock" banner; pool value in USD shown.
6. **Close**: mine sealed animation; withdraw + claim block 4; redemption instructions with eligibility state.

## 8. Anti-patterns considered and rejected

- **Random events / jackpots** need randomness. Robinhood Chain has no native VRF assumption we can rely
  on; keep v1 deterministic.
- **Rig decay / maintenance fees** (pay RIG to keep mining) punishes casual players and mostly moves
  burn from upgrades to taxes. Rejected for v1.
- **Stake unlock mid-season** would enable hop-in/hop-out strategies around block boundaries. Stake is
  locked for the season.
- **Fixed-cost upgrades** (e.g. "GPU tier 1 = 100 RIG") make whales' upgrades free relative to their
  stake and small players' upgrades unaffordable. Percent-of-stake pricing throughout.
