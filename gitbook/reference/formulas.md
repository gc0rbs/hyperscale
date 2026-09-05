# Formulas

All arithmetic on chain is integer, with multipliers in basis points and timestamps scaled by 10¹⁸ so shift boundaries are exact. The formulas below are the same ones, written plainly.

## Hashrate

```
gpuMult(g)  = 1 + 0.20 × g                    g = GPU tier, 0..5
baseHash    = W × gpuMult(gpuTier)            W = stake weight (RIG)
ocHash      = baseHash × 0.50 × activeOc      activeOc = 0..3
H           = baseHash + ocHash               ≤ 5 × W
```

## Work, difficulty, pay

```
work(rig, dt)   = H × dt                              hash-seconds
D_total         = expectedTotalHash × plannedSeconds  set at creation
D_b             = D_total × diffShare_b               20 / 25 / 25 / 30 %
r_b             = S_b ÷ D_b                           fragments per hash-second; S_b = pool_b × 1,000,000
earned(rig, b)  = Σ over the rig's time in block b of H × dt × r_b
block b found   when Σ over all rigs of work in block b = D_b
```

Consequences: `Σ earned in block b = S_b` exactly when the block is found; a rig's pay is independent of other rigs; the ETA to a block is `(D_b − work so far) ÷ totalHash`.

## Upgrade prices

```
gpuCost(tier t → t+1) = W × gpuCostBps[t]        4 / 6 / 9 / 13 / 18 %
coolingCost(c → c+1)  = W × coolCostBps[c]       3 / 5 / 8 %
overclockCost         = W × ocCostBps            2 %
```

All three are transferred to `0x…dEaD`.

## Heat

```
on overclock:   heat += heatPerOc[coolingTier]    40 / 30 / 22 / 15;  reverts if heat > 100
at shift end:   heat = max(0, heat − coolPerShift[coolingTier])   10 / 18 / 26 / 36
```

## Overclock expiry

```
expiryShift = currentShift + ocShiftSpan (1)      all active overclocks share one expiry
                                                  buying another refreshes it
```

## Fees

```
activationFee = W × 1 %                 charged on top of the deposit
exitReturn    = deposit × (1 − 3 %)
cashOut(f)    = f ÷ 1,000,000 × price × (1 − 1 %)     price = Chainlink USD, ≤ 26 h old
redeem(f)     = f ÷ 1,000,000 Stock Tokens
```

## Coverage of an upgrade

The app's "covers X% of the mine" is `(D_total − work so far) ÷ D_total` for permanent tiers, and the share of `D_total` in the overclock's remaining shifts for overclocks. The "equivalent fragments" shown is the added hashrate × the remaining seconds at the current pace × the block rates along the way, an estimate that moves with the ETA.
