# PRD – Stock Miner: a progress-based virtual mining game on Robinhood Chain

| Field | Value |
|---|---|
| Status | Draft v0.2 for review (v0.1 was time-boxed at 24h; v0.2 makes duration an outcome of participation) |
| Owner | Product (TBD) |
| Target chain | Robinhood Chain (Arbitrum Orbit L2, EVM) – see assumptions in §10 |
| Companion docs | 02 Mining model · 03 Game design · 04 Tokenomics · 05 Contracts · 06 App · 07 Compliance · 08 Delivery |

## 1. Summary

Stock Miner is an on-chain game played in **seasons**. A season is one mine with four **reward
blocks**. Players stake **$RIG** (the game token) or **RIG/USDC LP tokens** to activate **virtual
rigs**. Each rig has a **hashrate** derived from its stake and from upgrades bought by **burning $RIG**
(GPU tiers, cooling tiers, overclocks). Every second a rig is active it contributes `hashrate × 1s` of
**work** to the current block. Each block has a **difficulty** (a fixed amount of work) and a pool of
**Stock Token fragments** – fractional claims on tokenized stocks such as NVDAx. The block pays a
fixed number of fragments per unit of work, so it is **found** exactly when the pool is exhausted.
When block 4 is found the mine **closes permanently**: stakes are returned and fragments are redeemed
for whole Stock Tokens (or cashed out) during a redemption window.

Because blocks are found by work rather than by the clock, **a season has no fixed length**. With the
participation the operator planned for, a season lasts about a day; with twice the hashrate it lasts
half as long, with a fifth it lasts five times longer. Every mechanic (overclock expiry, heat decay,
"boost remaining" on upgrades) is expressed in mine progress, so the game plays identically over six
hours or six weeks.

Mining is **virtual**. There is no hashing in the browser and no proof of work. See
[02-MINING-MODEL.md](02-MINING-MODEL.md).

## 2. Problem and opportunity

- Robinhood Chain is being positioned as the venue for tokenized stocks. Stock Tokens are, on their
  own, a passive asset. There is very little on-chain activity that *uses* them.
- Existing "mining game" formats drive strong short-burst engagement but pay out in their own
  inflationary token, which limits the audience to speculators.
- Paying out in fragments of real equities gives a legible, non-inflationary prize with mainstream
  appeal, and gives Robinhood-adjacent users a reason to hold and use $RIG on the chain.
- Progress-based blocks give the format a natural arc regardless of how big the crowd is: a mine with
  50 rigs and a mine with 50,000 rigs both end when the work is done, and the prize per unit of work is
  the same in both.

## 3. Goals

| ID | Goal | How we know |
|---|---|---|
| G1 | Ship a complete, fair, fully on-chain season loop: stake → upgrade → mine → find blocks → claim → redeem/withdraw | End-to-end season on testnet, then mainnet season 1 |
| G2 | Make $RIG spend meaningful | ≥ 25% of staked RIG-equivalent burned on upgrades in season 1 |
| G3 | Drive real distribution of Stock Tokens | ≥ 60% of the prize pool redeemed for Stock Tokens or cash within the redemption window |
| G4 | Keep the game legible and provably fair | Every reward computable from on-chain data; public param file; no admin discretion during a live season |
| G5 | Be pace-agnostic | The same contracts and UI run a 6-hour season and a 6-week season with no parameter other than difficulty differing |
| G6 | Be repeatable | Season 2 can be launched from the same code with only a new parameter set |

## 4. Non-goals (v1)

- Real proof-of-work, browser hashing, or any reward that depends on player compute.
- Open-ended / perpetual mining. Every mine has four blocks and then closes.
- Difficulty adjustment during a season. Difficulty is fixed at creation (see doc 02 §5 for why).
- Tradeable rig NFTs, rig marketplaces, guilds, referral trees.
- Fragment trading on a DEX. Fragments are non-transferable in v1 pending legal review (doc 07).
- Fiat on-ramp, custodial wallets, or account abstraction. Users bring an EVM wallet.
- Multi-chain deployment. Robinhood Chain only.

## 5. Target users

1. **Crypto-native gamers / degens** – already on Arbitrum-family chains, comfortable with wallets,
   attracted by high-intensity events and a burn economy.
2. **Stock-token holders on Robinhood Chain** – want a way to *earn* more of the equities they hold.
3. **$RIG holders / LPs** – want yield on RIG and a reason to provide liquidity.

Assumptions about wallet eligibility for Stock Token redemption are critical and are covered in doc 07.

## 6. Core loop (player view)

```
Pre-open                Mine open: 4 blocks, each found when its difficulty is reached        Post-close (30d)
┌──────────────────┐    ┌──────────┬──────────┬──────────┬──────────┐                        ┌───────────────┐
│ stake RIG or LP  │ ─▶ │ Block 1  │ Block 2  │ Block 3  │ Block 4  │ ── found = close ────▶ │ withdraw stake│
│ buy GPU/cooling  │    │  NVDAx   │  TSLAx   │  AAPLx   │  SPYx    │                        │ claim block 4 │
│ (rigs idle)      │    │ work accumulates; shifts tick; overclock; claim found blocks       │ redeem/cash   │
└──────────────────┘    └──────────┴──────────┴──────────┴──────────┘                        └───────────────┘
        ◀── leave any time (early-exit fee) ──▶            ◀── fail-safe: max duration ──▶
```

1. **Activate a rig.** Deposit RIG or RIG/USDC LP. The deposit sets the rig's *stake weight* (LP gets a
   bonus). The rig starts contributing work at the mine's open time.
2. **Upgrade.** Burn RIG to raise GPU tier (permanent hashrate multiplier), raise cooling tier
   (more overclocks per shift), or overclock (temporary boost lasting a fixed slice of mine progress,
   generates heat).
3. **Mine.** Each block pays a fixed number of fragments per hash-second. The UI shows fragments
   accruing live, the block's progress bar, and an ETA computed from current total hashrate.
4. **Find and claim.** When a block's work is done it is found; rigs claim their fragments of it.
5. **Close.** When block 4 is found the mine closes. Withdraw stake, claim block 4.
6. **Redeem.** Burn 1,000,000 fragments to receive one Stock Token (eligible wallets) or cash out at
   oracle price (others), within the redemption window.

Players may **leave early** at any time for a small fee; that returns their deposit and stops their
rig. Nothing in the game requires waiting for a date.

## 7. Functional requirements

IDs are stable and referenced from the tech specs and test plan. "MUST" items are v1 launch blockers.

### 7.1 Season lifecycle
- **FR-S1** A season MUST be a separately deployed, immutable mine with fixed parameters (`specs/params`).
- **FR-S2** A season MUST have the phases `Funding` → `PreOpen` → `Open` → `Closed`. `Open` starts at `openTime`. `Closed` starts when block 4 is found, or at `openTime + maxDuration` (fail-safe), whichever is first. No admin action may move a phase.
- **FR-S3** Block *b* is found at the exact instant cumulative work in block *b* reaches `difficulty[b]`. The contract MUST compute this instant deterministically from the piecewise-constant total hashrate, even if no transaction happened at that instant.
- **FR-S4** The mine MUST refuse `activate`, `upgrade`, `overclock` after close. It MUST refuse fee-free `withdraw` before close.
- **FR-S5** The mine MUST NOT open unless the redemption vault holds the full advertised Stock Token pool for all four blocks. If funding fails, all pre-open stakes MUST be withdrawable fee-free and activation fees refundable.
- **FR-S6** Admin powers during `Open` MUST be limited to `pause` (emergency stop). Pausing MUST NOT alter rewards or difficulty; if paused for longer than a fixed grace period, `emergencyWithdraw` MUST return stakes and cancel the season.
- **FR-S7** The fail-safe `maxDuration` MUST be long relative to the planned pace (default 30× the planned duration, minimum 14 days) and MUST be disclosed as a fail-safe, not a schedule.

### 7.2 Rigs and staking
- **FR-R1** A player MAY own any number of rigs. Each rig is a single deposit of exactly one asset (RIG or the season's LP token).
- **FR-R2** Stake weight MUST be `amount` for RIG and `amount × lpWeightPerToken` for LP, where `lpWeightPerToken` is fixed at season creation from the pair's reserves (doc 04).
- **FR-R3** Stake weight MUST be ≥ `minStakeWeight`. Stake on an existing rig MUST NOT be increased (prevents cheap-upgrade-then-top-up; open another rig instead).
- **FR-R4** Activation MAY charge a fee in RIG (`activationFeeBps` of stake weight) routed to the treasury; the fee MUST be shown before signing.
- **FR-R5** Rigs are non-transferable in v1.
- **FR-R6** A rig MAY be deactivated at any time while the mine is open (`exit`). The deposit is returned minus `earlyExitFeeBps` to treasury; the rig stops contributing work; its already-earned fragments stay claimable; its upgrades are lost.

### 7.3 Upgrades (all paid by burning RIG)
- **FR-U1** GPU tier 0–5, each tier adds a fixed hashrate multiplier increment; cost of tier *g→g+1* is `gpuCostBps[g]` of stake weight.
- **FR-U2** Cooling tier 0–3; higher tier lowers heat per overclock and raises heat dissipated at each shift boundary; cost is `coolCostBps[c]` of stake weight.
- **FR-U3** Overclock: cost `ocCostBps` of stake weight; adds `ocBoostBps` of *base* hashrate per active overclock; active until the end of the **next shift** after purchase (a shift is `1/shiftsPerBlock` of a block's difficulty, i.e. a slice of progress, not of time); adds `heatPerOc[coolingTier]` heat; MUST revert if resulting heat > `heatMax` or active overclocks ≥ `maxActiveOc`. Buying another overclock refreshes the expiry of all of the rig's active overclocks.
- **FR-U4** Upgrades MUST be purchasable during `PreOpen` (GPU, cooling) and `Open` (all). GPU and cooling tiers persist for the season.
- **FR-U5** 100% of upgrade spend MUST be burned (sent to the RIG `burn` function), not to treasury.

### 7.4 Mining and reward blocks
- **FR-M1** Each block *b* has a stock `stock[b]`, a pool `poolTokens[b]`, a difficulty `difficulty[b]` in hash-seconds, and pays `poolTokens[b] × FRAG_PER_TOKEN / difficulty[b]` fragments per hash-second of work.
- **FR-M2** A rig's earnings over any interval MUST equal `rigHash × seconds × ratePerWork[b]`, independent of other rigs. Accounting MUST be exact to rounding-down dust and computable from public state (doc 05 §4).
- **FR-M3** When `totalHash == 0` no work accrues, no fragments are emitted, and the mine simply waits. No fragments are ever emitted without a corresponding unit of work.
- **FR-M4** Hashrate changes MUST only occur at transactions and at shift boundaries (overclock expiry, heat decay). Shift and block boundaries are determined by work, and the contract MUST record their exact timestamps when it discovers them.
- **FR-M5** A block's fragments are claimable only after that block is found (or the mine closed by fail-safe). Claiming MUST mint ERC-1155 fragments with id = the block index.
- **FR-M6** Late entrants MAY activate rigs at any time before close and earn from activation onward only.
- **FR-M7** Total fragments minted for block *b* MUST never exceed `poolTokens[b] × FRAG_PER_TOKEN`.

### 7.5 Close, withdrawal, redemption
- **FR-C1** After close, `withdraw(rigId)` MUST return the full original deposit (RIG or LP). Burned upgrades are not refunded.
- **FR-C2** Redemption: burn `FRAG_PER_TOKEN` fragments of block *b* to receive 1.0 Stock Token `stock[b]`, if the caller is eligible per the season's `IEligibility` adapter.
- **FR-C3** Cash-out: ineligible (or any) holders MAY burn fragments for USDC at the oracle price minus `cashOutFeeBps`, limited by the vault's USDC reserve.
- **FR-C4** Redemption window is `redemptionDays` (default 30) from close. Afterwards the operator MAY sweep unclaimed assets to the treasury per doc 04 §6.
- **FR-C5** If the mine closes by fail-safe mid-block, the fragments earned so far in that block are claimable; the unmined remainder and all later blocks' pools stay in the vault for sweep.

### 7.6 App
- **FR-A1** Live mine view: per-rig hashrate, heat, active overclocks and their remaining progress, block progress bar, ETA to next shift / block / close derived from current total hashrate, and a live fragment estimate (doc 06 §3).
- **FR-A2** Leaderboard of rigs and wallets by hashrate and by claimed fragments, from an indexer.
- **FR-A3** Every transaction preview MUST show RIG to be burned, the resulting hashrate, and the mine progress the purchase covers.
- **FR-A4** Clear phase UX: pre-open, open, closed, redemption; and an explicit "this mine has closed permanently" state.
- **FR-A5** Eligibility check for Stock Token redemption is shown before the user attempts to redeem.
- **FR-A6** Duration messaging MUST be "estimated" everywhere; the app MUST never present the fail-safe date as an end date.

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | All season contracts immutable, non-upgradeable; new season = new deployment via factory. |
| NFR-2 | Rig interaction gas ≤ ~250k on Robinhood Chain in the normal case; the global settlement loop is bounded by the number of shifts crossed since the last transaction (≤ `blocks × shiftsPerBlock`) and a public `poke()` exists so ops can keep it short. |
| NFR-3 | External audit of contracts before mainnet; public bug bounty. |
| NFR-4 | App works with no indexer (degraded: no leaderboard) – all critical reads go straight to the RPC. |
| NFR-5 | No mechanic depends on wall-clock intervals shorter than one second; boundary timestamps are stored as 1e18 fixed-point so work is exact. |
| NFR-6 | Parameters published at least 48h before a season opens; the app reads them from chain, not config. |
| NFR-7 | Mobile-first UI; no client compute beyond animation. |

## 9. Dependencies and risks (summary)

| Dependency / risk | Impact | Mitigation |
|---|---|---|
| Stock Tokens on Robinhood Chain have transfer restrictions (KYC allowlist) | Vault cannot hold/transfer them; redemption impossible | Partnership + allowlisting of the vault; or use a permissionless issuer (e.g. xStocks) for season 1; cash-out fallback. Doc 07. |
| Fragments could be characterised as securities/derivatives | Legal exposure | Non-transferable fragments in v1; counsel review; geo-fence the front-end. Doc 07. |
| Difficulty set far too high for actual participation | Season drags for weeks; players disengage | Difficulty sizing rules (doc 04 §5), pre-open TVL visibility, early exit, fail-safe close. Doc 02 §5. |
| Difficulty set far too low | Season over in an hour; latecomers miss it | Same sizing rules; PreOpen window gives everyone the same start. |
| Prize pool must be pre-funded with real assets | Cash cost per season | Treasury funding model, activation fee, pool sizing rules. Doc 04. |
| LP weight manipulation before season | Unfair LP multiplier | Weight fixed from TWAP at season creation, ≥ 48h before open. |
| Chain immaturity (RPC, explorer, DEX availability) | Delivery slip | Verify assumptions in §10 in the discovery milestone. |

## 10. Assumptions to verify (discovery milestone)

1. Robinhood Chain is an Arbitrum Orbit chain (Nitro stack), EVM-equivalent, ETH for gas, sub-second blocks, `block.timestamp` set by the sequencer and monotone.
2. Stock Tokens are ERC-20 with 18 decimals and a transfer-restriction hook; the exact interface of the restriction is unknown and must be obtained.
3. A constant-product (Uniswap v2-style) DEX exists on the chain for the RIG/USDC pair; if only a v3-style DEX exists, LP staking is deferred to v1.1.
4. A price oracle (Pyth or Chainlink) publishes the underlying equity prices on the chain, needed for cash-out.
5. Testnet faucets, a block explorer, and a public RPC exist.

## 11. Release scope

**v1 (season 1):** everything marked MUST above; RIG staking; LP staking if assumption 3 holds; non-transferable fragments; redemption + cash-out; early exit; leaderboard; ETA display.

**v1.1 candidates:** rig NFTs (transferable), fragment transferability (post legal), "browser boost" mini-game (doc 02 §6), multiple LP pairs, season pass / cosmetics, cross-season fragment roll-over.

## 12. Success metrics (season 1)

| Metric | Target |
|---|---|
| Unique wallets with ≥ 1 rig | 2,000 |
| RIG-equivalent staked (TVL at open) | ≥ 5% of circulating RIG |
| RIG burned / RIG staked | ≥ 25% |
| Actual season duration vs planned | within 0.5×–3× of the planned pace |
| Median rigs per wallet | 1–2 |
| Prize pool redeemed within window | ≥ 60% |
| Early exits as share of rigs | ≤ 10% |
| Fail-safe close triggered | never |
| Critical incidents | 0 |
