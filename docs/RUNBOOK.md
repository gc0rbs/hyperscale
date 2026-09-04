# Stock Miner – season runbook

How one season is deployed, run and closed using only the scripts in this repo. Every step below was
executed against a local Anvil "long" season (planned pace one week, then time-warped) on 2026-09-04;
the exact commands are the ones that ran. Replace the Anvil defaults with the chain profile and keys
for the target chain.

Roles and keys (never in files; environment only):

| Role | Env var | Powers |
|---|---|---|
| Deployer | `PRIVATE_KEY` | deploys the factory once; runs `CreateSeason` and therefore becomes the vault's funding **operator** |
| Operator | `OPERATOR_KEY` | `fund` (one-shot), `sweep` (permissionless; the operator just runs it) |
| Guardian | `GUARDIAN_KEY` | the season's `treasury` address: `pause`, `unpause`. Nothing else |
| Keeper | `KEEPER_KEY` | any funded key; sends `poke()` |

`RPC_URL` and `CHAIN_ID` select the chain for the TypeScript scripts (defaults: local Anvil, 31337).
`ops/scripts/forge-script.sh` sets `NO_PROXY` for localhost so forge broadcasts work inside remote
Claude sessions.

## 0. Prerequisites

- `bash .claude/hooks/session-start.sh` (Foundry, pnpm, uv) and `cd contracts && forge build`.
- Chain profile in `ops/chains/<name>.json` with every address filled (`ops/chains/README.md`).
- The decisions in `docs/09-OPEN-QUESTIONS.md` Q1 (stock tokens / eligibility) and Q3 (DEX / LP) made.
- A treasury wallet (the client runs a single operator key, not a multisig: use a hardware wallet that is
  never the deployer or keeper key; it receives fees and sweeps and holds the pause power), the four
  Stock Token pool amounts in the operator's wallet, and the USDG reserve.

## 1. Deploy the factory (once per chain)

```
cd ops
PRIVATE_KEY=0x… BASE_URI="https://<app>/api/frag/{id}.json" pnpm deploy-factory            # dry run
PRIVATE_KEY=0x… BASE_URI="https://<app>/api/frag/{id}.json" pnpm deploy-factory --broadcast \
    --verify --verifier blockscout --verifier-url $ROBINHOOD_EXPLORER_API
```

Writes `contracts/deployments/<chainId>-factory.json`. On Anvil add `DEPLOY_MOCKS=true` to also
deploy RIG, mock LP/USDC, a mock oracle, an allowlist eligibility adapter and four mock Stock Tokens.

## 1b. Deploy the adapters (once per chain, or when the stock set changes)

```
PRIVATE_KEY=0x… pnpm deploy-adapters --chain robinhood               # dry run: deploys in simulation and prints every feed's live price
PRIVATE_KEY=0x… pnpm deploy-adapters --chain robinhood --broadcast --verify --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api
```

Deploys `OpenEligibility` and `ChainlinkOracle(stocks, feeds)` from the profile's `stocks` and `feeds`
maps and writes `contracts/deployments/<chainId>-adapters.json`; `plan` picks the addresses up from
there when the profile leaves `oracle` / `eligibility` at zero. The dry run fails if any feed does
not answer, which is the pre-open oracle check from docs/08 §4 done early.

## 2. Plan the season

```
pnpm plan --chain robinhood-testnet --name season-1 \
     --expected-hash 10000000 --planned-seconds 10800 --max-duration 21600 --open-time +600 \
     [--lp-bonus-bps 12500] [--treasury 0x…] [--usdc-reserve 50000]
```

- `--pool-usd 10000` sizes the four pools by value share (15/20/25/40) at live Robinhood mid prices
  (`--prices file.json` for an offline quote). Without it the template's token amounts are used.
- `--expected-hash` is expected total hash in RIG-equivalent units (stake weight × average
  multiplier; docs/04 §5.2). `--planned-seconds` is the pace you would like at that hash; duration is
  an outcome. `--max-duration` is the cap (default 2× planned, ≥ 1h): the season ends there if block 4
  is not found first. `--open-time +0` opens the season the moment it is created; the default `+600`
  leaves ten minutes between planning and creation.
- `lpWeightPerToken` comes from 24 hourly samples of the pair's reserves and supply
  (`2 × RIG reserve / LP supply`, times the bonus). Needs an archive RPC; `--allow-spot` accepts the
  latest block only, `--rig-per-lp <x>` overrides (Anvil).
- The result is validated against the factory rules and written to `ops/seasons/<name>.json` with its
  `paramsHash` (keccak256 of the ABI-encoded `SeasonParams`, the same value `SeasonCreated` emits).
  **Publish the file and the hash** before open (docs/08 §4 item 1).

Anvil dry run used a deliberately long season so warps could be exercised: `pnpm plan --chain anvil --name dryrun --expected-hash 5000000 --planned-seconds 604800 --max-duration 2592000 --open-time +172900 --rig-per-lp 2`.

## 3. Create the season

```
SEASON_FILE=../ops/seasons/season-1.json PRIVATE_KEY=0x… pnpm create-season                # dry run: predicted addresses, InvalidParams reasons
SEASON_FILE=../ops/seasons/season-1.json PRIVATE_KEY=0x… pnpm create-season --broadcast --verify …
```

Writes `contracts/deployments/<chainId>.json` (mine, fragments, vault, tokens, `openTime`,
`paramsHash`). The app reads this file server-side; commit it for the app deployment, or set the
app's `NEXT_PUBLIC_*` addresses from it. Confirm the emitted `paramsHash` equals the published one.

## 4. Fund the vault

```
OPERATOR_KEY=0x… pnpm fund --dry-run      # shows balances needed vs held
OPERATOR_KEY=0x… pnpm fund                # approve + RedemptionVault.fund(usdcReserve)
```

`fund` refuses if the operator lacks any pool amount. Afterwards `phase() == PreOpen`. On Anvil,
`--mint-mocks` mints the pool and USDC and allowlists the vault first.

Before open, also (docs/08 §4): confirm the eligibility adapter with one eligible and one ineligible
wallet (`cast call <eligibility> "isEligible(address)(bool)" <addr>`), confirm every oracle feed is
fresh (`cast call <vault> "quoteCashOut(uint256,uint256)(uint256,uint256)" 0 1000000` must not revert
with `StalePrice`), and start the keeper and watcher.

## 5. Run: keeper and watcher

```
KEEPER_KEY=0x… pnpm keeper --interval 30                 # poke() when a shift boundary is due or state is >10 min stale
ALERT_WEBHOOK_URL=https://… pnpm watch --interval 60 --planned-seconds 10800   # alerts to Slack/Discord
```

The keeper is a convenience: shift boundaries are computed retroactively and exactly by any
transaction, so a missed poke costs nothing but gas for the next player. Keep one keeper per season;
it stops itself at close. The watcher pages on `Paused`, `SeasonCancelled`, warns on
`totalHash == 0` for over an hour, ETA to close over 5× planned, and a low USDG reserve after close.
Alerts at `warn` and `page` level go to `ALERT_WEBHOOK_URL` (Slack or Discord incoming webhook, JSON
`{text, content}`), the same message at most once per `ALERT_REPEAT_SECONDS` (default 15 min); every
alert is also logged. `ALERT_MIN_LEVEL=info` forwards the per-tick status lines too.

**Hosting.** `docker-compose.yml` at the repo root runs Postgres, the Ponder indexer, the keeper and
the watcher on one small VM (docs/06 §5–6): `cp .env.example .env`, fill `CHAIN_ID`, `RPC_URL`,
`KEEPER_KEY`, `ALERT_WEBHOOK_URL`, then `docker compose up -d --build`. The season addresses are read
from `contracts/deployments/<chainId>.json` (mounted read-only; copy it to the host after
CreateSeason). The indexer starts from the `block` CreateSeason records in that file. Keys come from
the environment only. The images (`ops/Dockerfile`, `indexer/Dockerfile`) build from the repo root;
the ops image compiles the contracts with the pinned Foundry so the ABIs match the deployed code.
`docker compose logs -f watch` is the on-call view; `docker compose run --rm keeper guardian status`
runs a one-off command in the same image (`sweep`, `guardian pause` with `GUARDIAN_KEY` set).

What "normal" looks like: `[keeper] ok shift=N next shift in ~Ns`, and `[watch] INFO shift N hash=…`.
`poke` gas is ~60k when one boundary is crossed and up to ~960k if all 32 are crossed at once.

## 6. Alert responses

| Alert | Meaning | Response |
|---|---|---|
| `est. Nh to close, > 5x planned` | hash far below expectation; the cap will end the season | No contract action exists or should. Comms: say which blocks will pay. The cap is `openTime + maxDurationSeconds` (season file, `plan.capIso`) |
| `totalHash == 0 for over an hour` | everyone exited or nobody joined | Nothing accrues; the cap will close the season. Comms |
| `mine is PAUSED` | a guardian paused | Confirm it was intentional. The clock keeps running (work still accrues for everyone by timestamp; FR-S6 says pausing must not alter rewards); players cannot act until unpause. **Unpause within `pauseGraceSeconds` (default 30 min)** or any player may cancel the season |
| `season CANCELLED` | a pause outlived the grace period and a player called `emergencyWithdraw` | Irreversible. Every player recovers their deposit with `emergencyWithdraw`; unclaimed fragments are forfeited; run `sweep` (works immediately) and publish the incident |
| `USDC reserve below 1,000` | cash-out reserve nearly spent | In-kind redemption is unaffected. Top-ups are not possible (the vault is one-shot funded); update comms |
| `ClosedByFailSafe` event | block 4 not found by the cap | A normal ending. Unmined pool is swept after the window and funds the next season. Size the next season from this one's hash |
| keeper `error` lines | RPC or key problem | Restart with a healthy RPC; nothing on chain depends on it |

## 7. Pause and cancel procedure

Rehearsed on Anvil (2026-09-04): pause → players' actions revert → unpause → actions succeed; then
pause → warp past the grace period → `emergencyWithdraw` by one player flips the season to
`Cancelled`, the watcher pages, other players withdraw, `sweep` moves the whole pool and reserve to
the treasury immediately.

```
GUARDIAN_KEY=0x… pnpm guardian pause          # emergency stop
pnpm guardian status                          # shows grace deadline
GUARDIAN_KEY=0x… pnpm guardian unpause        # before the grace deadline
```

Rules: the guardian key is the treasury wallet (one signer, by the client's decision); pause only for a suspected accounting
bug or a Stock Token / oracle incident that would make claims or redemptions wrong. A pause after
close does not cancel anything (players use `emergencyWithdraw` to recover deposits if it outlives the
grace period; their fragments stay claimable after an unpause).

## 8. Close, redemption, sweep

- Close happens on its own when block 4 is found (or at the cap). The keeper exits; the watcher
  reports the reserve. Players `claimAll` and `withdraw`; the app guides them. Redemption
  (`redeem` in kind, `cashOut` to USDC) is open for `redemptionDays` after `closeX`.
- Comms cadence (docs/08 §4): withdraw reminder at close, redemption reminders at day 1, 7, 25.
- After the window: `OPERATOR_KEY=0x… pnpm sweep` (permissionless, repeatable). Its output names any
  Stock Token whose transfer hook refused the treasury; allowlist the treasury with the issuer and run
  it again. `sweep --dry-run` shows what would move.

## 9. Anvil dry run (the whole thing in ten minutes)

```
anvil --block-time 1 &
cd ops
DEPLOY_MOCKS=true pnpm deploy-factory --broadcast
pnpm plan --chain anvil --name dryrun --expected-hash 5000000 --planned-seconds 604800 --max-duration 2592000 --open-time +172900 --rig-per-lp 2
SEASON_FILE=../ops/seasons/dryrun.json pnpm create-season --broadcast
OPERATOR_KEY=<anvil #0> pnpm fund --mint-mocks
pnpm play fund-players
pnpm play activate 1 1000000 ; pnpm play activate-lp 2 150000 ; pnpm play activate 3 1500000
pnpm play gpu 0 3 ; pnpm play cooling 1 2
pnpm play warp 172950 ; KEEPER_KEY=<anvil #1> pnpm keeper --once ; pnpm watch --once --planned-seconds 604800
pnpm play oc 0 ; pnpm play oc 0 ; pnpm play status
pnpm play warp 175000 ; KEEPER_KEY=… pnpm keeper --once ; pnpm play status      # block 0 found (shift 8)
pnpm play claim 0
pnpm play warp 900000 ; KEEPER_KEY=… pnpm keeper --once                          # closed
pnpm play claim 0 ; pnpm play withdraw 0 ; …                                     # every rig
pnpm play redeem 1 3                                                             # account 1 redeems block 3
OPERATOR_KEY=… pnpm sweep                                                        # "window still open"
pnpm play warp 2700000 ; OPERATOR_KEY=… pnpm sweep                               # moves the remainder
```

`pnpm play …` and `--mint-mocks` refuse to run on any chain other than 31337. Point the app at the
dry run with `NEXT_PUBLIC_DEV_ACCOUNTS=1 pnpm --filter @stock-miner/app dev`; it reads
`contracts/deployments/31337.json`.

## 10. App deployment

The app is a Next.js site (Vercel or any Node host). Copy `app/.env.example` and fill the season
addresses from `contracts/deployments/<chainId>.json`, or commit that file and leave the addresses
unset. `NEXT_PUBLIC_RPC_URL` should be a dedicated endpoint. Set `NEXT_PUBLIC_WC_PROJECT_ID` for
WalletConnect (mobile wallets); injected wallets work without it. The geo-fence
(`app/src/middleware.ts`) is on in production and blocks US, CA, GB and CH by the edge country header,
returning the `/restricted` page with HTTP 451; set `NEXT_PUBLIC_GEOFENCE=0` for testnet rehearsals.
The wallet button prompts a network switch when the wallet is on the wrong chain. Set
`NEXT_PUBLIC_APP_URL` to the public origin: it is the base for the share card (`/opengraph-image`,
rendered from live season state) and the WalletConnect metadata. `/how-it-works`
and `/terms` carry the disclosures docs/07 §5 requires; counsel replaces the terms wording before
launch.

## 11. Release checklist

See the last entry of `docs/BUILD-LOG.md` for the docs/08 §4 checklist with the current status of
each item.
