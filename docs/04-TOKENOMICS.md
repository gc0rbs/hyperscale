# Tokenomics – $RIG, LP bonus, prize-pool and difficulty sizing

## 1. $RIG

| Property | Value |
|---|---|
| Standard | ERC-20 + EIP-2612 permit + `burn` / `burnFrom` (OpenZeppelin `ERC20Burnable`) |
| Supply | Fixed at genesis: 1,000,000,000 RIG. No mint function. |
| Decimals | 18 |
| Chain | Robinhood Chain (native). No bridge in v1. |
| Deflation | All upgrade spend is burned. Supply only goes down. |

### Genesis allocation (proposal, to be finalised)

| Bucket | % | Vesting | Purpose |
|---|---|---|---|
| Public launch (LBP or fair launch) | 30% | none | price discovery, distribution |
| Protocol-owned liquidity | 10% | permanent | seeds RIG/USDC pool |
| Season prize treasury | 30% | released per season by multisig | sold or paired to buy Stock Tokens for prize pools |
| Team & contributors | 15% | 12-month cliff, 36-month linear | |
| Ecosystem / partners / airdrops | 15% | multisig-controlled | Robinhood Chain ecosystem, integrations |

Team allocation and public sale structure require legal input (doc 07). Nothing in the game contracts
depends on these numbers.

## 2. Value flows in a season

```
 player ──upgrades (100%)──▶ RIG.burn()
 player ──activation fee (1%)──▶ Treasury
 player ──early exit fee (3% of deposit)──▶ Treasury
 player ──stake──▶ SeasonMine ──(close or exit)──▶ player
 Treasury ──Stock Tokens──▶ RedemptionVault ──redeem──▶ eligible player
 Treasury ──USDC reserve──▶ RedemptionVault ──cashOut──▶ any player
 RedemptionVault ──unclaimed after 30d──▶ Treasury ──▶ RIG buyback & burn
```

Sinks (RIG destroyed) per rig, as a share of stake weight:
- GPU tiers: up to 50%.
- Cooling tiers: up to 16%.
- Overclocks: 2% each; a cooling-3 rig keeping 3 running for all 32 shifts burns ~48 × 2% = 96%.
- Theoretical max ≈ 160%; an engaged but sane player burns 15–40%. The economic simulation (doc 08)
  must confirm that the *median* rig burns 10–30% under realistic strategies.

Because duration floats, note what does **not** change with pace: every sink above is a fraction of
stake per fraction of mine progress. A slow season does not cost more RIG in overclocks for the same
share of the mine; it costs more wall-clock attention.

Sources of protocol revenue:
- Activation fee `activationFeeBps = 100` (1% of stake weight, in RIG) to treasury.
- Early exit fee `earlyExitFeeBps = 300` on the deposit, to treasury.
- Cash-out fee `cashOutFeeBps = 100` on fragment cash-outs.
- Sweep of unclaimed prize assets after the redemption window.

## 3. LP staking

- Season 1 LP token: RIG/USDC constant-product pair on the chain's canonical DEX (assumption to verify).
- `lpWeightPerToken` is fixed at season creation:

```
rigPerLp         = TWAP over 24h of (reserveRIG × 2 / totalSupplyLP)  // RIG-equivalent value of 1 LP
lpWeightPerToken = rigPerLp × lpBonusBps / 10_000                     // lpBonusBps = 12_500 (+25%)
```

- A snapshot, not a live price: if RIG doubles during the season an LP rig does not get heavier. This
  keeps weights unmanipulable and hashrate piecewise constant (FR-M4).
- Why 25%: LP is riskier (impermanent loss, both assets locked) and deepens the pool that season prize
  sales flow through. Tunable per season.
- LP deposits are returned in full at close regardless of pool price movement.

## 4. Why stake instead of buy-in

Stake is capital at opportunity cost, not spent. Players size positions freely and the
"upgrade as a percent of stake" pricing works. The only money that leaves the player is what they
choose to burn, plus fees. TVL is a public measure of demand for RIG, and because it is visible in
PreOpen it also tells everyone the *estimated season length* before the mine opens.

## 5. Prize-pool and difficulty sizing

Two operator decisions per season, both fixed at creation, neither adjustable afterwards.

### 5.1 Pool value

- **Target pool value** `V = k × expected RIG burn value`, `k ∈ [1.5, 3]`. If we expect 2M RIG burned
  at $0.05 ($100k), fund a $150k–$300k pool. Early seasons lean generous.
- Split across blocks by value 15 / 20 / 25 / 40%.
- Four liquid, recognisable underlyings; block 4 an index (SPYx/QQQx) so the finale prize is the least
  volatile.
- Fund the vault ≥ 48h before `openTime`. The season cannot open unfunded (FR-S5).
- USDC reserve for cash-out ≥ 50% of pool value at funding.

### 5.2 Difficulty

```
expectedTotalHash = expectedStakeWeight × expectedAvgMultiplier     // e.g. 7M × 1.4 = ~10M
D_total           = expectedTotalHash × plannedSeconds              // e.g. 10M × 86,400
D_b               = D_total × diffShareBps[b] / 10_000              // 20 / 25 / 25 / 30 %
maxDuration       = max(14 days, 30 × plannedSeconds)               // fail-safe only
```

Inputs come from the PreOpen signal of the previous season, the public pre-commit TVL (the app shows
"if the mine opened now it would last ~X"), and the economic simulation. Guidance:

| If actual hash turns out to be | Season lasts | Acceptable? |
|---|---|---|
| > 4× planned | < ¼ planned | Uncomfortable for latecomers; consider a longer PreOpen next season |
| 0.5×–4× planned | ¼–2× planned | Fine, this is the design range |
| 0.1×–0.5× | 2–10× planned | Fine mechanically; comms shift to "long haul"; watch early-exit rate |
| < 0.033× | fail-safe | Season closes with block 4 partial; unmined pool swept; post-mortem |

Do not size difficulty to force a duration by making it small: a season that ends in 40 minutes is a
worse outcome than one that runs for four days.

## 6. Post-season sweep

After `redemptionDays`:
1. Unclaimed fragments remain in wallets but can no longer be redeemed from this season's vault.
   (v1.1 option: roll them into next season's vault at a discount.)
2. Remaining Stock Tokens (including any unmined pool from a fail-safe close) and USDC are swept to the
   treasury.
3. Treasury sells swept assets and uses ≥ 50% of proceeds for RIG buyback-and-burn, published on-chain.

## 7. Parameters (defaults)

See `specs/params/season-default.json`. Summary:

| Param | Default |
|---|---|
| `minStakeWeight` | 100 RIG |
| `activationFeeBps` | 100 |
| `earlyExitFeeBps` | 300 |
| `lpBonusBps` | 12,500 |
| `gpuMultBps` | [10000, 12000, 14000, 16000, 18000, 20000] |
| `gpuCostBps` | [400, 600, 900, 1300, 1800] |
| `coolCostBps` | [300, 500, 800] |
| `heatPerOc` | [40, 30, 22, 15] |
| `coolPerShift` | [10, 18, 26, 36] |
| `heatMax` | 100 |
| `ocCostBps` | 200 |
| `ocBoostBps` | 5000 |
| `maxActiveOc` | 3 |
| `ocShiftSpan` | 1 (expires at the end of the shift after the current one) |
| `blocks` | 4 |
| `shiftsPerBlock` | 8 |
| `diffShareBps` | [2000, 2500, 2500, 3000] |
| `difficultyTotal` | sized per season (example 8.64e11 hash-seconds) |
| `maxDurationSeconds` | 2,592,000 (30 days) |
| `fragPerToken` | 1,000,000 |
| `redemptionDays` | 30 |
| `cashOutFeeBps` | 100 |
