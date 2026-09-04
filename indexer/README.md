# @stock-miner/indexer

[Ponder](https://ponder.sh) project that indexes one Stock Miner season and serves leaderboards
and history (docs/06 §5). The app reads the chain directly; this indexer is optional and only
backs the leaderboard / history screens.

## What it indexes

Every `SeasonMine` event (`RigActivated`, `GpuUpgraded`, `CoolingUpgraded`, `Overclocked`,
`ShiftEnded`, `BlockFound`, `ClosedByFailSafe`, `Claimed`, `Exited`, `Withdrawn`,
`SeasonCancelled`) and the `RedemptionVault` events `Redeemed` and `CashedOut`.

Tables (`ponder.schema.ts`): `season`, `shift`, `reward_block`, `rig`, `overclock`, `burn`,
`claim`, `exit`, `redemption`, `wallet_stats`. `wallet_stats` is the per-wallet aggregate used by
the leaderboard: active rig count, Σ weight, Σ baseHash (`weight × gpuMultBps[tier] / 10000`,
overclock boosts excluded because they are transient; the field is base hash, not effective hash), total burned, and claimed fragments per
block (`claimed0..claimed3`) plus `totalClaimed`. Season params are read once via
`SeasonMine.params()` and cached for the process.

## Endpoints (`src/api/index.ts`)

| Route | Returns |
| --- | --- |
| `GET /season` | season row (openTime, current shift, closeX, fail-safe / cancel flags), rig and wallet counts, found blocks |
| `GET /shifts` | ended shifts in order (`endX`, `totalHashAfter`, block index) and found blocks |
| `GET /leaderboard?by=hash\|claimed\|burned` | top 50 wallets by Σ **base** hash (`totalHash`; overclock boosts excluded because they are transient, audit I2), Σ claimed fragments, or Σ burned RIG |
| `GET /rigs/:owner` | a wallet's rigs (active first), its aggregate stats, and its claim / burn / redemption history |
| `POST /graphql` | Ponder's auto-generated GraphQL over the whole schema |

All `uint256` values are returned as decimal strings; addresses are lowercase.

## Running against the Anvil demo

1. Start Anvil and deploy the demo season. This writes `contracts/deployments/31337.json`, which
   the indexer reads for the `mine`, `fragments` and `vault` addresses:

   ```sh
   anvil                                          # in another terminal
   pnpm --filter @stock-miner/ops deploy-demo
   ```

2. Run the indexer (defaults: chain 31337 at `http://127.0.0.1:8545`, embedded PGlite in
   `.ponder/`, HTTP on `http://localhost:42069`):

   ```sh
   pnpm --filter @stock-miner/indexer dev
   curl 'localhost:42069/leaderboard?by=hash'
   ```

Configuration is by environment (see `.env.example`): `PONDER_RPC_URL_<chainId>`, `CHAIN_ID`,
`DEPLOYMENTS_FILE`, per-contract `*_ADDRESS` overrides, `START_BLOCK` (default: the `block` recorded
in the deployments file by CreateSeason, else 0), and `DATABASE_URL` for Postgres instead of PGlite.
`indexer/Dockerfile` and the root `docker-compose.yml` run it with Postgres (docs/RUNBOOK.md §5). Ponder's own switches (`PONDER_LOG_LEVEL`,
`PONDER_PORT`, ...) apply as usual.

## Scripts

- `dev` / `start` – sync ABIs, then `ponder dev` / `ponder start`.
- `codegen` – sync ABIs and write `ponder-env.d.ts` (commit that file; do not edit it).
- `check` – `codegen` followed by `tsc --noEmit`; part of `pnpm -r check`.

`abis/*.ts` are generated from `../app/src/abi/*.json` (the forge-synced ABIs, refreshed by
`pnpm --filter @stock-miner/ops sync-abi`). JSON imports lose the literal types Ponder needs to
type event names and arguments, so `scripts/sync-abis.mjs` re-emits them `as const`. Do not edit
them by hand; rerun `codegen` after the contracts change.
