# Rounds: the continuous, hourly mine

| | |
|---|---|
| Status | **Adopted 2026-09-08** (client decision). Replaces the season mode entirely; the season contracts stay in the repo as the previous design. |
| Supersedes | docs/03 §season structure, docs/05 (SeasonMine/SeasonFactory/RedemptionVault), the season parts of docs/04 and RUNBOOK |
| Contracts | `contracts/src/rounds/`: `RoundMine`, `RoundFragments`, `RoundVault`. Interfaces in `specs/contracts/IRound*.sol` |

## 1. Why

Seasons needed a pool fixed in advance, a deployment per season and a 30-day tail. The client's
funding is now a stream (the trading fees on $VRAM's Pons pool) and the product needs a payout every hour, not
every season. So: one permanent mine, rounds of one hour, a pot per round filled from the fee stream,
split among the rigs by the work they did in that hour, claimable for fifteen minutes, and whatever is
not claimed rolls into the next pot.

## 2. Model

- **Time.** `genesis` is the mine's first round start. Round `r` covers
  `[genesis + r·L, genesis + (r+1)·L)` with `L = roundSeconds` (3600). Rounds close on the clock; no
  transaction is needed for a round to end, and the first transaction after a boundary records it.
- **Rigs.** Stake $VRAM once (weight `W` = amount; stake immutable per rig), pay the activation fee to
  the treasury, and mine every round until `exit` (deposit minus `exitFeeBps` back; the rig's work in
  the round it left still counts). Upgrades, cooling, heat and overclocks are unchanged in shape:
  GPU tiers multiply base hash, cooling lowers heat per overclock and speeds decay (one decay step per
  round boundary), overclocks add `ocBoostBps × activeOc` of base hash until the end of round
  `current + ocRoundSpan`. All upgrade spend is burned (transfer to `0x…dEaD`).
- **Work.** `hash × seconds`, exactly as before. A rig's work in round `r` is the integral of its hash
  over its active overlap with the round; the round's work is the sum over rigs. Both are exact:
  global settlement accumulates `totalHash × dt` per round and applies overclock expiry at round
  boundaries; rig settlement is piecewise-constant arithmetic over the boundaries it crossed.
- **Pot.** Four stocks, one pot per stock per round.
  `pot[r][s] = funded during r + pot[r-1][s] − claimed[r-1][s]` (the rollover), finalised by the first
  settlement after round `r` closes, which is always after round `r-1`'s claim window has ended
  (`claimSeconds < roundSeconds` is enforced). A round nobody mined rolls its whole pot forward.
- **Funding.** Anyone calls `fund(s, amount)` as often as fees arrive: the stock moves into the vault
  and into the running round's pot at once; the pot is locked the moment the round closes. So the
  first hour pays out whatever accrued during it, and a project can run for two hours or two weeks
  with no funding calendar. Nothing is ever scheduled ahead, so there is nothing to unschedule; the
  operator's only way out is `halt` (below).
- **FeeFunder.** How Pons V2 pays, verified on chain 2026-09-10 (DECISIONS same date): a launch
  names a **creator fee recipient** and a creator tax (up to 10% of every trade, on top of the base
  fee whose creator share is 70%). Everything the creator earns is ETH, but it is never pushed: the
  bonding curve (before graduation) and the Pons meme hook on the Uniswap v4 pool (after it) credit
  the recipient in the shared `PonsV2FeeEscrow`, and the recipient must `claim()` from the escrow.
  Sweeping the pending fees into the escrow is the Pons sweep operator's job; the recipient may also
  sweep when no internal swap is needed. The `FeeFunder` contract
  (`contracts/src/rounds/FeeFunder.sol`) is that recipient: its address is entered as the creator fee
  recipient when the token is launched, and the operator wires its **collect calls** afterwards
  (`setCollects`: `curve.sweepFees(0)`, `hook.sweepPoolFees(poolId, 0, 0)`, `escrow.claim()`; a
  revert is swallowed, so nothing owed and a phase that is over are not errors). A flusher (the keeper
  key, holding only gas) calls `flush(minOut[])` every few minutes: the contract runs the collect
  calls, wraps every ETH, pays the owner-set **cuts** in ETH off the top (`setCuts`: client decision
  2026-09-10, of a 3% creator tax 2% funds the game and 0.5% goes to each of two wallets, so the cuts
  are 1/6 + 1/6 of what the funder receives; cuts sum to less than 100%, a wallet that refuses ETH
  reverts the flush until re-pointed), splits the remaining WETH across the four stocks by share
  (15/20/25/40 by default),
  swaps directly against each stock's Uniswap v3 WETH pool (the contract is the swap caller and pays
  in `uniswapV3SwapCallback`, which only accepts a configured pool and only pays WETH), and funds
  every token bought into the running round in the same transaction. The minimums are quoted
  off-chain right before sending (simulate, then a 1% haircut); a moved price reverts the whole flush
  and the fees wait. No key ever holds the fees. The owner (the operator) can re-point pools and
  shares (`setLegs`), re-wire the collect calls (`setCollects`), change the cuts (`setCuts`), allow
  flushers, and sweep the contract. A collect call can never target WETH, the mine or a configured pool.
- **Claim.** After round `r` closes, each rig that worked in it can `claim` during
  `[close, close + claimSeconds)` (900 s) and receives `pot[r][s] × rigWork[r] / roundWork[r]` of each
  stock as fragments (whole fragments; dust stays in the pot). Only the latest closed round is ever
  claimable; earlier rounds have already rolled over. Claiming is per rig; `claimAll` claims every rig
  of the caller.
- **Fragments.** One permanent ERC-1155, id = stock index, `fragPerToken` fragments per whole Stock
  Token, non-transferable. Redeem in kind (eligibility-gated) or cash out (oracle, USDG reserve) at any
  time while the vault holds the stock; there is no redemption window. The vault always holds at least
  the stock behind every un-redeemed fragment plus every unclaimed and running pot, because the only
  things that ever leave it are redemptions, cash-out-freed stock and a halt rescue.
- **Pre-token deployment.** The mine can be deployed with `rig = 0` and `genesis = 0` before the
  token exists. Funding works (into round 0); every player action reverts `NotLaunched`.
  The operator calls `launch(rig, genesis)` exactly once (genesis not in the past); both are then
  fixed for good. This lets the contracts be verified, funded and wired to the site days ahead, and
  go live with one transaction the moment the token is live (client requirement 2026-09-08).
- **Catch-up.** Round boundaries are recorded by the first transaction after them, at most 48 per
  call (`MAX_ROUNDS_PER_UPDATE`, ~7M gas) so an idle stretch can never exceed the block gas limit;
  until the mine is caught up, every action except `poke` and `halt` reverts with `NotCaughtUp`, since
  past rounds must be recorded with the hash they really had. The keeper pokes every hour so this
  never shows in practice.
- **Pause blocks claims too.** A pause inside a claim window can let it lapse; the share rolls into
  the next pot, never to the operator.
- **Halt.** The guardian (treasury key) can `pause`; players `emergencyWithdraw` after the grace period,
  which halts the mine for good. The operator can `halt()` at any time (client decision: they are a
  known team and the site says so). A halted mine never closes another round: stakes come back in full,
  the unclaimed and running pots return to the operator through `RoundVault.rescue()`,
  fragments already claimed stay redeemable.

## 3. Parameters (`RoundParams`, immutable)

| Field | Default | Note |
|---|---|---|
| `rig`, `stocks[4]`, `treasury`, `usdc`, `eligibility`, `oracle` | chain profile | token address is fixed per mine; a new token = a new mine |
| `genesis` | deploy time, rounded up to the next hour; or 0 with `rig = 0` for a pre-token deployment, set once by `launch` | |
| `roundSeconds` / `claimSeconds` | 3600 / 900 | claim < round |
| `fragPerToken` | 1,000,000 | |
| `minStakeWeight`, `activationFeeBps`, `exitFeeBps` | 100 VRAM, 100, 300 | |
| `gpuMultBps[6]`, `gpuCostBps[5]`, `coolCostBps[3]`, `heatPerOc[4]`, `coolPerRound[4]`, `heatMax`, `ocCostBps`, `ocBoostBps`, `maxActiveOc`, `ocRoundSpan` | docs/03 values | `ocRoundSpan` 1: expires at the end of the next round |
| `cashOutFeeBps`, `maxPriceAgeSeconds`, `pauseGraceSeconds` | 100, 4 days, 1800 | |

## 4. Invariants (tests encode these)

1. `Σ_r Σ_rigs claimed[r][s] + unclaimed pots + the running pot ≤ stock funded` per stock, always;
   `pot[r][s] ≥ Σ claims of round r`.
2. `totalHash == Σ live rig hash` after every settlement; expiring buckets match live overclock hash.
3. A rig's work in a closed round never changes afterwards; a round's work never changes after close.
4. `Σ_rigs rigWork[r] == roundWork[r]` up to one work unit of rounding per rig per segment.
5. Vault stock balance ≥ (minted − redeemed) × 1e18 / fragPerToken + unclaimed pots + the running pot.
6. Mine VRAM balance == Σ outstanding deposits.
7. `heat ≤ heatMax`, `activeOc ≤ maxActiveOc`.
8. After a halt nothing accrues, no round closes, deposits return in full.

## 5. What this changes in the hard rules (CLAUDE.md)

- "No reward by wall-clock time" becomes "rounds are wall-clock, rewards inside a round are by work
  share". Difficulty and block discovery are gone.
- "Rewards independent of other rigs" becomes a per-round share: the pot is whatever the fee stream
  brought, so it has to be split. There is still no reward-per-share accumulator: each round is settled
  in isolation from exact per-rig and global work.
- Admin power: `pause` (guardian) plus `launch` (once) and `halt` (operator), all public on the site.
