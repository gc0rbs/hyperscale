# Tech spec – app, indexer, operations

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router), TypeScript, wagmi + viem, RainbowKit/ConnectKit | Standard EVM dapp stack; SSR for the landing/season pages |
| State | TanStack Query for chain reads; a small Zustand store for UI | Polling-friendly, cache per rig |
| Styling | Tailwind + a small component set; motion via Framer Motion | Fast to iterate on the mine visuals |
| Indexer | Ponder (preferred) or a subgraph | Leaderboards, history, per-wallet summaries |
| Hosting | Vercel (app), Railway/Fly (Ponder + Postgres) | |
| Analytics | PostHog (self-hosted or EU cloud) | Event funnel; no PII beyond wallet address |
| Geo-fencing | Edge middleware on the app | Compliance requirement, doc 07 |

The app must work without the indexer for every critical action (NFR-4): activation, upgrades,
claim, withdraw, redeem all read directly from contracts.

## 2. Screens

| Route | Purpose | Key data |
|---|---|---|
| `/` | Season landing: status, countdown, pool (stocks + USD value), TVL, top rigs | factory registry, `SeasonMine.params()`, `blockInfo`, oracle |
| `/mine` | The game. Rig cards, hashrate ring, block card, fragment counters, upgrade shop, overclock | per-rig `rigs()`, `pending()`, `totalHash`, `accPerHash`, `lastUpdate` |
| `/mine/new` | Activate a rig: asset picker, amount, fee, resulting weight and share, LP explanation | `lpWeightPerToken`, balances, allowances |
| `/claim` | Unlocked blocks, claim buttons, fragment balances | `claimedMask`, `earned`, ERC-1155 balances |
| `/redeem` | Eligibility status; redeem in kind or cash out; window countdown | `IEligibility`, vault reserves, oracle |
| `/leaderboard` | Rigs and wallets by hashrate / fragments; burn leaderboard | indexer |
| `/seasons` | Past seasons summary (from season 2 on) | indexer |

Phase-driven layout: the same `/mine` route renders PreOpen, Open, Closed and Redemption states; the
Closed state shows a sealed mine and moves calls to action to withdraw/claim/redeem.

## 3. Live "mining" estimate

The client reproduces the contract math to animate fragments between transactions.

```ts
// inputs read every ~10s (one multicall): accPerHash, lastUpdate, totalHash, currentBlock,
// ratePerSecond[b], rig{baseHash, ocHash, debt, earned, lastBlock}
function estimateNow(nowSec) {
  const dt = clamp(nowSec - lastUpdate, 0, blockEnd(currentBlock) - lastUpdate);
  const accNow = totalHash > 0n ? accPerHash + (rate[currentBlock] * dt * 1e18) / totalHash : accPerHash;
  const rigHash = rig.baseHash + rig.ocHash;
  const unsettled = rig.lastBlock === currentBlock ? ((accNow - rig.debt) * rigHash) / 1e18 : /* multi-block path as in doc 05 §4.2 */ ...;
  return rig.earned[currentBlock] + unsettled;
}
```

Rendered at animation-frame rate using interpolation between the last two polled values. The UI labels
the number "estimated" until a block unlocks and the contract value is read.

The hashrate visualiser is a seeded PRNG producing hex strings at `H / 1e18` "hashes per second" (scaled
for display). It carries a persistent tooltip: *"Cosmetic. Rewards depend on your hashrate share, not on
this animation."*

## 4. Transaction UX

- Every write shows: RIG to burn or deposit, fee, new hashrate, new share of mine (`H/totalHash`),
  boost hours remaining, and a break-even hint in RIG terms (`pool value in RIG × Δshare × remaining
  fraction of block(s)` vs cost). The hint is informational and labelled as an estimate.
- Approvals: use `permit` for RIG (EIP-2612); LP tokens may need a classic `approve`.
- Errors mapped to plain text: `HeatTooHigh`, `MaxOverclocks`, `MineClosed`, `NotOwner`,
  `BelowMinStake`, `NotUnlocked`, `NotEligible`, `ReserveInsufficient`.
- Optimistic UI only after tx receipt; never before.

## 5. Indexer schema (Ponder)

Entities: `Season`, `Rig`, `Wallet`, `Block`, `Claim`, `Burn`, `Redemption`. Derived: hashrate history
per block (from `RigActivated`/`GpuUpgraded`/`Overclocked`/`BlockSettled`), burn totals, leaderboard
snapshots every minute.

Public GraphQL/REST read API; no writes.

## 6. Operations tooling

- `scripts/season/plan.ts`: takes a params JSON, computes `lpWeightPerToken` from DEX reserves
  (24h TWAP from indexer or RPC samples), prints pool USD value at oracle prices, validates params
  against factory rules, outputs the deploy calldata and a hash to publish.
- `scripts/season/fund.ts`: approves and funds the vault; asserts `phase() == PreOpen`.
- `scripts/season/watch.ts`: alerts (Telegram/Slack) on `Paused`, `SeasonCancelled`, totalHash == 0,
  vault reserve < 10% of outstanding fragments' value, oracle staleness.
- `scripts/season/sweep.ts`: after redemption window.

## 7. Testing (app)

- Playwright end-to-end against a local Anvil fork with time-warping helpers (`evm_increaseTime`) to
  drive all four blocks in minutes.
- Visual regression on `/mine` in each phase.
- Contract math parity test: TypeScript `estimateNow` vs Foundry `pending()` on 1,000 fuzzed states.

## 8. Accessibility and performance

- All game state readable without animation (reduced-motion respected).
- Initial `/mine` load ≤ 2s on 4G; one multicall for global state, one per rig.
- No WebGL requirement; CSS/SVG animation only.
