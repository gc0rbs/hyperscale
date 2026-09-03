# PRD – Stock Miner: a 24-hour virtual mining game on Robinhood Chain

| Field | Value |
|---|---|
| Status | Draft v0.1 for review |
| Owner | Product (TBD) |
| Target chain | Robinhood Chain (Arbitrum Orbit L2, EVM) – see assumptions in §10 |
| Companion docs | 02 Mining model · 03 Game design · 04 Tokenomics · 05 Contracts · 06 App · 07 Compliance · 08 Delivery |

## 1. Summary

Stock Miner is a time-boxed on-chain game. A **season** is a single mine that is open for exactly
24 hours. Players stake **$RIG** (the game token) or **RIG/USDC LP tokens** to activate **virtual rigs**.
Each rig has a **hashrate** derived from its stake and from upgrades bought by **burning $RIG**
(GPU tiers, cooling tiers, overclocks). The mine emits **Stock Token fragments** – fractional claims on
tokenized stocks such as NVDAx or AAPLx – continuously to rigs in proportion to hashrate. Emissions are
grouped into **four reward blocks** of six hours. Each block has its own stock and its own pool, and
becomes claimable when it unlocks. When block 4 unlocks the mine **closes permanently**: staking and
upgrades stop, stakes are returned, and fragments can be redeemed for whole Stock Tokens (or cashed out)
during a redemption window.

Mining is **virtual**. There is no hashing in the browser and no proof of work. The rationale and
alternatives are in [02-MINING-MODEL.md](02-MINING-MODEL.md).

## 2. Problem and opportunity

- Robinhood Chain is being positioned as the venue for tokenized stocks. Stock Tokens are, on their
  own, a passive asset. There is very little on-chain activity that *uses* them.
- Existing "mining game" formats (idle miners, staking games with upgrade sinks) drive strong short-burst
  engagement but usually pay out in their own inflationary token, which limits the audience to
  speculators.
- Paying out in fragments of real equities gives a legible, non-inflationary prize with mainstream
  appeal, and gives Robinhood-adjacent users a reason to hold and use $RIG on the chain.
- A 24-hour, close-forever format creates urgency, makes the economics finite and auditable, and lets
  the team ship seasons iteratively instead of maintaining an open-ended economy.

## 3. Goals

| ID | Goal | How we know |
|---|---|---|
| G1 | Ship a complete, fair, fully on-chain season loop: stake → upgrade → mine → claim → redeem/withdraw | End-to-end season on testnet, then mainnet season 1 |
| G2 | Make $RIG spend meaningful | ≥ 25% of staked RIG-equivalent burned on upgrades in season 1 |
| G3 | Drive real distribution of Stock Tokens | ≥ 60% of the prize pool redeemed for Stock Tokens or cash within the redemption window |
| G4 | Keep the game legible and provably fair | Every reward computable from on-chain data; public param file; no admin discretion during a live season |
| G5 | Be repeatable | Season 2 can be launched from the same code with only a new parameter set |

## 4. Non-goals (v1)

- Real proof-of-work, browser hashing, or any reward that depends on player compute.
- Open-ended / perpetual mining. Every mine closes.
- Tradeable rig NFTs, rig marketplaces, guilds, referral trees.
- Fragment trading on a DEX. Fragments are non-transferable in v1 pending legal review (§9, doc 07).
- Fiat on-ramp, custodial wallets, or account abstraction. Users bring an EVM wallet.
- Multi-chain deployment. Robinhood Chain only.

## 5. Target users

1. **Crypto-native gamers / degens** – already on Arbitrum-family chains, comfortable with wallets,
   attracted by short high-intensity events and a burn economy.
2. **Stock-token holders on Robinhood Chain** – want a way to *earn* more of the equities they hold.
3. **$RIG holders / LPs** – want yield on RIG and a reason to provide liquidity.

Assumptions about wallet eligibility for Stock Token redemption are critical and are covered in doc 07.

## 6. Core loop (player view)

```
Pre-open (up to 24h)      Mine open (24h, 4 blocks of 6h)                     Post-close (30d)
┌──────────────────┐      ┌─────────┬─────────┬─────────┬─────────┐            ┌───────────────┐
│ stake RIG or LP  │ ───▶ │ Block 1 │ Block 2 │ Block 3 │ Block 4 │ ─ close ─▶ │ withdraw stake│
│ buy GPU/cooling  │      │  NVDAx  │  TSLAx  │  AAPLx  │  SPYx   │            │ claim block 4 │
│ (rigs idle)      │      │ overclock, upgrade, claim unlocked blocks          │ redeem/cash   │
└──────────────────┘      └─────────┴─────────┴─────────┴─────────┘            └───────────────┘
```

1. **Activate a rig.** Deposit RIG or RIG/USDC LP. The deposit sets the rig's *stake weight* (LP gets a
   bonus). The stake is locked until the mine closes.
2. **Upgrade.** Burn RIG to raise GPU tier (permanent hashrate multiplier), raise cooling tier
   (more overclocks per block), or overclock (temporary boost for the rest of the current block,
   generates heat).
3. **Mine.** Each block streams its fragment pool to all active rigs pro rata to hashrate. The UI shows
   fragments accruing live.
4. **Claim.** When a block unlocks (its 6 hours end) rigs can claim that block's fragments.
5. **Close.** At 24h the mine closes. Withdraw stake, claim block 4.
6. **Redeem.** Burn 1,000,000 fragments to receive one Stock Token (eligible wallets) or cash out at
   oracle price (others), within the redemption window.

## 7. Functional requirements

IDs are stable and referenced from the tech specs and test plan. "MUST" items are v1 launch blockers.

### 7.1 Season lifecycle
- **FR-S1** A season MUST be a separately deployed, immutable mine with fixed parameters (`specs/params`).
- **FR-S2** A season MUST have five phases: `Funding` → `PreOpen` → `Open` (4 blocks) → `Closed` → `Redemption`; phase transitions MUST be driven by `block.timestamp` only, never by admin action.
- **FR-S3** The mine MUST refuse `activate`, `upgrade`, `overclock` after close. It MUST refuse `withdraw` before close.
- **FR-S4** The mine MUST NOT open (`Open` phase) unless the redemption vault holds the full advertised Stock Token pool for all four blocks. If funding fails, all pre-open stakes MUST be withdrawable and activation fees refundable.
- **FR-S5** Admin powers during `Open` MUST be limited to `pause` (emergency stop). Pausing MUST extend nothing and change no rewards; if paused for longer than a fixed grace period, `emergencyWithdraw` MUST return stakes and cancel the season.

### 7.2 Rigs and staking
- **FR-R1** A player MAY own any number of rigs. Each rig is a single deposit of exactly one asset (RIG or the season's LP token).
- **FR-R2** Stake weight MUST be `amount` for RIG and `amount × lpWeightPerToken` for LP, where `lpWeightPerToken` is fixed at season creation from the pair's reserves (doc 04).
- **FR-R3** Stake weight MUST be ≥ `minStakeWeight`. Stake on an existing rig MUST NOT be increased (prevents cheap-upgrade-then-top-up; open another rig instead).
- **FR-R4** Activation MAY charge a fee in RIG (`activationFeeBps` of stake weight) routed to the treasury; the fee MUST be shown before signing.
- **FR-R5** Rigs are non-transferable in v1.

### 7.3 Upgrades (all paid by burning RIG)
- **FR-U1** GPU tier 0–5, each tier adds a fixed hashrate multiplier increment; cost of tier *g→g+1* is `gpuCostBps[g]` of stake weight.
- **FR-U2** Cooling tier 0–3; higher tier lowers heat per overclock and raises heat dissipated at each block boundary; cost is `coolCostBps[c]` of stake weight.
- **FR-U3** Overclock: cost `ocCostBps` of stake weight; adds `ocBoostBps` of *base* hashrate for the remainder of the current block; adds `heatPerOc[coolingTier]` heat; MUST revert if resulting heat > `heatMax` or overclocks this block ≥ `maxOcPerBlock`.
- **FR-U4** Upgrades MUST be purchasable during `PreOpen` and `Open`. GPU and cooling tiers persist for the season; overclocks expire at the block boundary.
- **FR-U5** 100% of upgrade spend MUST be burned (sent to the RIG `burn` function), not to treasury.

### 7.4 Mining and reward blocks
- **FR-M1** Each block *b* has a stock token `stock[b]`, a pool `poolTokens[b]`, and emits `poolTokens[b] × FRAG_PER_TOKEN` fragments linearly over its 6 hours.
- **FR-M2** At any instant a rig earns `rate[b] × rigHash / totalHash`. Accounting MUST be exact to rounding-down dust and MUST be computable from public state (doc 05 §4).
- **FR-M3** If `totalHash == 0` during any interval, that interval's fragments are never minted and the corresponding Stock Tokens stay in the vault (swept after redemption).
- **FR-M4** Hashrate changes MUST only occur at transactions and at block boundaries (overclock expiry, heat decay). No hashrate change may depend on off-chain input.
- **FR-M5** A block's fragments are claimable only after that block's end. Claiming MUST mint ERC-1155 fragments with id = the block's stock id.
- **FR-M6** Late entrants MAY activate rigs at any time before close and earn from activation onward only.

### 7.5 Close, withdrawal, redemption
- **FR-C1** After close, `withdraw(rigId)` MUST return the full original deposit (RIG or LP). Burned upgrades are not refunded.
- **FR-C2** Redemption: burn `FRAG_PER_TOKEN` fragments of stock *s* to receive 1.0 Stock Token *s*, if the caller is eligible per the season's `IEligibility` adapter.
- **FR-C3** Cash-out: ineligible (or any) holders MAY burn fragments for USDC at the oracle price minus `cashOutFeeBps`, limited by the vault's USDC reserve.
- **FR-C4** Redemption window is `redemptionDays` (default 30). Afterwards the operator MAY sweep unclaimed assets to the treasury per doc 04 §6.

### 7.6 App
- **FR-A1** Live mine view: per-rig hashrate, heat, block countdown, and a live fragment estimate derived from on-chain state (doc 06 §3).
- **FR-A2** Leaderboard of rigs and wallets by hashrate and by claimed fragments, from an indexer.
- **FR-A3** Every transaction preview MUST show RIG to be burned and the resulting hashrate before signing.
- **FR-A4** Clear phase UX: pre-open, open, closed, redemption; and an explicit "this mine has closed permanently" state.
- **FR-A5** Eligibility check for Stock Token redemption is shown before the user attempts to redeem.

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | All season contracts immutable, non-upgradeable; new season = new deployment via factory. |
| NFR-2 | Rig interaction gas ≤ ~250k on Robinhood Chain; any loop bounded by the number of blocks (4). |
| NFR-3 | External audit of contracts before mainnet; public bug bounty. |
| NFR-4 | App works with no indexer (degraded: no leaderboard) – all critical reads go straight to the RPC. |
| NFR-5 | Timestamps: 6h blocks tolerate sequencer timestamp drift of minutes; no mechanic finer than 1 minute. |
| NFR-6 | Parameters published at least 48h before a season opens; the app reads them from chain, not config. |
| NFR-7 | Mobile-first UI; no client compute beyond animation. |

## 9. Dependencies and risks (summary)

| Dependency / risk | Impact | Mitigation |
|---|---|---|
| Stock Tokens on Robinhood Chain have transfer restrictions (KYC allowlist) | Vault cannot hold/transfer them; redemption impossible | Partnership + allowlisting of the vault; or use a permissionless issuer (e.g. xStocks) for season 1; cash-out fallback. Doc 07. |
| Fragments could be characterised as securities/derivatives | Legal exposure | Non-transferable fragments in v1; counsel review before launch; geo-fence the app front-end. Doc 07. |
| Prize pool must be pre-funded with real assets | Cash cost per season | Treasury funding model, activation fee, pool sizing rules. Doc 04. |
| LP weight manipulation before season | Unfair LP multiplier | Weight fixed from TWAP at season creation, ≥48h before open. |
| Chain immaturity (RPC, explorer, DEX availability) | Delivery slip | Verify assumptions in §10 in the discovery milestone. |

## 10. Assumptions to verify (discovery milestone)

1. Robinhood Chain is an Arbitrum Orbit chain (Nitro stack), EVM-equivalent, ETH for gas, ~250ms blocks, `block.timestamp` set by sequencer.
2. Stock Tokens are ERC-20 with 18 decimals and a transfer-restriction hook; the exact interface of the restriction (allowlist contract, `canTransfer`, etc.) is unknown and must be obtained.
3. A constant-product (Uniswap v2-style) DEX exists on the chain for the RIG/USDC pair; if only a v3-style DEX exists, LP staking is deferred to v1.1 (positions are NFTs).
4. A price oracle (Pyth or Chainlink) publishes the underlying equity prices on the chain, needed for cash-out.
5. Testnet faucets, a block explorer, and a public RPC exist.

## 11. Release scope

**v1 (season 1):** everything marked MUST above; RIG staking; LP staking if assumption 3 holds; non-transferable fragments; redemption + cash-out; leaderboard.

**v1.1 candidates:** rig NFTs (transferable), fragment transferability (post legal), "browser boost" mini-game (doc 02 §5), multiple LP pairs, season pass / cosmetics.

## 12. Success metrics (season 1)

| Metric | Target |
|---|---|
| Unique wallets with ≥ 1 rig | 2,000 |
| RIG-equivalent staked (TVL at open) | ≥ 5% of circulating RIG |
| RIG burned / RIG staked | ≥ 25% |
| Median rigs per wallet | 1–2 (not dozens: indicates sybil for no reason) |
| Prize pool redeemed within window | ≥ 60% |
| Blocks with `totalHash == 0` intervals | 0 |
| Critical incidents | 0 |
