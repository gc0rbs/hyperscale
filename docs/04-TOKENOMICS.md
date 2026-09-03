# Tokenomics – $RIG, LP bonus, prize-pool funding

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
| Season prize treasury | 30% | released per season by governance/multisig | sold or paired to buy Stock Tokens for prize pools |
| Team & contributors | 15% | 12-month cliff, 36-month linear | |
| Ecosystem / partners / airdrops | 15% | multisig-controlled | Robinhood Chain ecosystem, integrations |

The team allocation and public sale structure require legal input (doc 07). Nothing in the game
contracts depends on these numbers.

## 2. Value flows in a season

```
                       burn (100%)                           treasury
 player ──upgrades──▶ RIG.burn()                 player ──activation fee (1%)──▶ Treasury
 player ──stake────▶ SeasonMine ──(close)──▶ player   (stake returns in full)
 Treasury ──Stock Tokens──▶ RedemptionVault ──redeem──▶ eligible player
 Treasury ──USDC reserve──▶ RedemptionVault ──cashOut──▶ any player
 RedemptionVault ──unclaimed after 30d──▶ Treasury ──▶ RIG buyback & burn
```

Sinks (RIG destroyed):
- GPU tiers: up to 50% of stake weight per rig.
- Cooling tiers: up to 16%.
- Overclocks: 2.5% each, realistic max ~30% (12 overclocks).
- Theoretical max burn per rig ≈ 96% of its stake weight; an engaged but sane player burns 10–30%.

Sources of protocol revenue:
- Activation fee: `activationFeeBps = 100` (1% of stake weight, paid in RIG). Goes to treasury, not burned.
- Cash-out fee: `cashOutFeeBps = 100` on fragment cash-outs.
- Sweep of unclaimed prize assets after the redemption window.

## 3. LP staking

- Season 1 LP token: RIG/USDC constant-product pair on the chain's canonical DEX (assumption to verify).
- `lpWeightPerToken` is fixed at season creation:

```
rigPerLp        = TWAP over 24h of (reserveRIG × 2 / totalSupplyLP)   // RIG-equivalent value of 1 LP
lpWeightPerToken = rigPerLp × lpBonusBps / 10_000                     // lpBonusBps = 12_500 (+25%)
```

- It is a snapshot, not a live price. If RIG doubles during the season an LP rig does not get heavier.
  This makes weights unmanipulable mid-season and keeps hashrate piecewise constant (FR-M4).
- Why 25%: LP is riskier (impermanent loss, both assets locked) and grows the pool that season prize
  sales flow through. Tunable per season.
- LP deposits are returned in full at close regardless of pool price movement.

## 4. Why stake instead of buy-in

Stake is capital *at risk of opportunity cost*, not spent. This lets players size positions freely and
makes the "upgrade as a percent of stake" pricing work. The only money that leaves the player is what
they choose to burn, plus the 1% fee. It also means the mine's TVL is a direct, public measure of
demand for RIG.

## 5. Prize-pool sizing

The prize pool is the season's cost. Rules of thumb for the operator (not enforced on-chain):

- **Target pool value** `V = k × expected RIG burn value`, `k ∈ [1.5, 3]`. If we expect 2M RIG to be
  burned at $0.05 ($100k), fund a $150k–$300k pool. Early seasons lean generous to bootstrap.
- Split across blocks by value 15 / 20 / 25 / 40%.
- Choose 4 liquid, recognisable underlyings. Block 4 should be an index (SPYx/QQQx) so the finale prize
  is the least volatile.
- Fund the vault ≥ 48h before `T0`. The season cannot open unfunded (FR-S4).
- USDC reserve for cash-out: ≥ 50% of pool value at funding time, topped up if eligibility data
  suggests most players cannot redeem in kind.

A spreadsheet/Monte-Carlo model of burn vs pool value under different player mixes is a deliverable of
milestone M1 (doc 08). The key sensitivities: RIG price at open, share of LP stake, and how many
players max GPU early.

## 6. Post-season sweep

After `redemptionDays`:
1. Unclaimed fragments remain in wallets but can no longer be redeemed from this season's vault.
   (v1.1 option: roll them into next season's vault at a discount.)
2. Remaining Stock Tokens and USDC are swept to the treasury.
3. Treasury sells swept assets and uses ≥ 50% of proceeds for RIG buyback-and-burn, published on-chain.

## 7. Parameters (defaults)

See `specs/params/season-default.json`. Summary:

| Param | Default |
|---|---|
| `minStakeWeight` | 100 RIG |
| `activationFeeBps` | 100 |
| `lpBonusBps` | 12,500 |
| `gpuMultBps` | [10000, 12000, 14000, 16000, 18000, 20000] |
| `gpuCostBps` | [400, 600, 900, 1300, 1800] |
| `coolCostBps` | [300, 500, 800] |
| `heatPerOc` | [40, 30, 22, 15] |
| `coolPerBlock` | [20, 35, 50, 70] |
| `heatMax` | 100 |
| `ocCostBps` | 250 |
| `ocBoostBps` | 5000 |
| `maxOcPerBlock` | 3 |
| `blockSeconds` | 21,600 |
| `blocks` | 4 |
| `fragPerToken` | 1,000,000 |
| `redemptionDays` | 30 |
| `cashOutFeeBps` | 100 |
