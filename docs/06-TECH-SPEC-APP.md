# Tech spec – app, indexer, operations

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router), TypeScript, wagmi + viem, RainbowKit/ConnectKit | Standard EVM dapp stack; SSR for landing/season pages |
| State | TanStack Query for chain reads; small Zustand store for UI | Polling-friendly, cache per rig |
| Styling | Tailwind + small component set; motion via Framer Motion | Fast iteration on mine visuals |
| Indexer | Ponder (preferred) or a subgraph | Leaderboards, history, per-wallet summaries, shift/block timeline |
| Keeper | Small cron worker calling `poke()` | Keeps the global catch-up loop short; not required for correctness |
| Notifications | Web push (opt-in) | Blocks are found on no schedule; players need to be told |
| Hosting | Railway for everything (app, Ponder + Postgres, keeper, watcher) behind Cloudflare's proxy | One platform; Cloudflare supplies the country header. `docs/RUNBOOK.md` §10c; `docker-compose.yml` remains for a single VM |
| Analytics | PostHog (EU) | Funnel; wallet address only |
| Geo-fencing | Edge middleware | Compliance requirement, doc 07 |

The app works without the indexer for every critical action (NFR-4).

## 2. Screens

| Route | Purpose | Key data |
|---|---|---|
| `/` | Season landing: phase, pool (stocks + USD), TVL, **estimated season length at current hash**, top rigs | factory registry, `params()`, `progress()`, `eta()`, oracle |
| `/mine` | The game. Rig cards, hashrate ring, block card with progress bar + shift ticks + ETA, fragment counters, upgrade shop, overclock | per-rig `rigs()`, `pending()`, `totalHash`, `progress()`, `eta()` |
| `/mine/new` | Activate a rig: asset picker, amount, fee, resulting hashrate, fragments/s, effect on ETA | `lpWeightPerToken`, balances, allowances |
| `/claim` | Found blocks, claim buttons, fragment balances | `claimedMask`, `earned`, ERC-1155 balances |
| `/redeem` | Eligibility; redeem in kind or cash out; window countdown | `IEligibility`, vault reserves, oracle |
| `/leaderboard` | Rigs and wallets by hashrate / fragments / burn | indexer |
| `/seasons` | Past seasons: duration, TVL, burn, pool | indexer |

Phase-driven layout: `/mine` renders PreOpen, Open, Closed and Redemption states. Open has two
densities: **live** (ETA to next shift < ~2h) and **long haul** (otherwise), which de-emphasises
overclocks and pushes notifications.

## 3. Live estimate and ETA

The client reproduces the contract math between transactions. Because pay is per unit of the rig's own
work, the estimate needs no global accumulator:

```ts
// polled every ~10s in one multicall:
//   shift, workInShift, lastX, totalHash, closeX, ratePerWork[], shiftEndX[shift-1],
//   rig{baseHash, ocHash, ocExpiryShift, lastX, earned[], lastShift}
function estimate(nowSec: number) {
  const nowX = BigInt(nowSec) * WAD;
  const b = Number(shift / shiftsPerBlock);
  let hash = rig.baseHash + (rig.ocHash > 0n && rig.ocExpiryShift >= shift ? rig.ocHash : 0n);
  const dtX = nowX - rig.lastX;                       // client assumes no boundary since last poll…
  const unsettled = mulDiv(hash * dtX / WAD, ratePerWork[b], WAD);
  return rig.earned[b] + unsettled;                   // …and re-syncs on every poll
}

function eta(nowSec: number) {
  if (totalHash === 0n) return null;                  // idle: show "mine paused – no active rigs"
  const remainingShift = shiftDifficulty(shift) - workInShift - totalHash * (BigInt(nowSec) * WAD - lastX) / WAD;
  const toShiftEnd = remainingShift * WAD / totalHash; // X-seconds
  // block/close ETA: sum remaining shift difficulties in the block / season at current totalHash
  ...
}
```

Rules:
- Every duration in the UI is prefixed "est." and re-computed on every poll; a tooltip explains that
  anyone joining, leaving or overclocking changes it.
- If a shift boundary was crossed between polls, the client shows the on-chain number after the next
  poll rather than extrapolating across the boundary.
- The cap (`openTime + maxDuration`) is shown on the mine page from the start as the latest possible
  end ("ends at block 4 or HH:MM, whichever first"); the closed screen says whether the cap or block 4
  ended the season and what rolls forward.
- The hashrate visualiser is a seeded PRNG producing hex strings at a speed proportional to `H`. It
  carries a persistent tooltip: *"Cosmetic. Rewards depend on your hashrate, not on this animation."*

## 4. Transaction UX

- Every write shows: RIG to burn or deposit, fee, new hashrate, new fragments/s per block, the share of
  the mine the purchase covers ("covers ~2 shifts ≈ 6% of the season"), est. wall-clock coverage at
  current pace, and a break-even hint in RIG terms. Hints are labelled as estimates.
- Overclock preview warns if the current shift is > 80% complete ("expires soon; you'd get ~1.1 shifts").
- Approvals: `permit` for RIG (EIP-2612); LP tokens may need classic `approve`.
- Errors mapped to plain text: `HeatTooHigh`, `MaxOverclocks`, `MineClosed`, `NotOwner`,
  `BelowMinStake`, `NotFound(block)`, `NotEligible`, `ReserveInsufficient`.
- Optimistic UI only after tx receipt.
- The app calls `poke()` in the background (via the keeper, not the user's wallet) when it detects the
  chain is more than one shift behind, so users' own transactions stay cheap.

## 5. Indexer schema (Ponder)

Entities: `Season`, `Rig`, `Wallet`, `Shift` (index, endX, totalHashAfter), `Block` (foundAt, duration),
`Claim`, `Burn`, `Exit`, `Redemption`. Derived: hashrate history, burn totals, leaderboard snapshots per
shift, season duration vs planned.

## 6. Operations tooling

All in `ops/` (`pnpm --filter @stock-miner/ops <script>`); the full procedure is `docs/RUNBOOK.md`.

- `deploy-factory` / `create-season`: wrappers over `contracts/script/DeployFactory.s.sol` and
  `CreateSeason.s.sol` (forge scripts; dry run without `--broadcast`; `--verify` via Blockscout flags).
- `plan`: params template + chain profile (`ops/chains/<name>.json`) → resolved season JSON in
  `ops/seasons/`. Computes `lpWeightPerToken` from 24 hourly samples of the pair's reserves, sizes
  `difficulty[]` from expected hash and planned pace (doc 04 §5.2), validates against the factory rules
  (`ops/src/lib/validate.ts` mirrors `SeasonFactory._validate`), prints the params hash.
- `fund`: checks balances, approves and calls `RedemptionVault.fund`; asserts `phase() == PreOpen`.
- `keeper`: calls `poke()` when a shift boundary is due or the stored state is > 10 min stale.
- `watch`: alerts on `Paused`, `SeasonCancelled`, `totalHash == 0` for > 1h, ETA to close > 5× planned,
  vault reserve low after close.
- `guardian`: `pause` / `unpause` / `status` with the treasury key.
- `sweep`: after the redemption window or a cancellation; repeatable.
- `play` (Anvil only): scripted players for dry runs and rehearsals.

## 7. Testing (app)

- Playwright end-to-end against a local Anvil fork with time-warping helpers to drive all 32 shifts
  in minutes, at three paces (fast, planned, slow) to exercise both layouts.
- Visual regression on `/mine` in each phase and density.
- Contract math parity test: TypeScript `pending`/`eta` vs the contract's `pending()`/`eta()` on random
  states against Anvil (`pnpm --filter @stock-miner/app parity`).

## 8. Accessibility and performance

- All game state readable without animation (reduced-motion respected).
- Initial `/mine` load ≤ 2s on 4G; one multicall for global state, one per rig.
- No WebGL requirement; CSS/SVG animation only.
