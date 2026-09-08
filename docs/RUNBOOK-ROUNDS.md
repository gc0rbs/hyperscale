# Hyperscale – round mine runbook

How the continuous hourly mine (`docs/13-ROUNDS.md`) is deployed, funded, kept and stopped, using only
the scripts in this repo. It replaces the season runbook (`docs/RUNBOOK.md`) for everything after the
2026-09-05 seasons; that file stays for their redemption tail and sweeps.

Written against the 2026-09-05 retro (`docs/BUILD-LOG.md`, same date): one deployment, no launch
nights, every irreversible action confirmed with its exact parameters, one operator per environment.

## Roles and keys (environment only, never in files or chat)

| Role | Env var | Powers |
|---|---|---|
| Deployer / operator | `PRIVATE_KEY` (deploy), `OPERATOR_KEY` (after) | deploys the three contracts once and is the mine's `operator`: `unschedule`, `halt`, vault `rescue` |
| Fee wallet | `FUNDER_KEY` | receives the Pons trading tax, swaps it into the four Stock Tokens, calls `fund`. Any wallet may fund |
| Guardian | `GUARDIAN_KEY` | the `treasury` address: `pause`, `unpause`. Receives activation and exit fees |
| Keeper | `KEEPER_KEY` | its own funded key; sends `poke()` at round boundaries. Alerts below `KEEPER_MIN_ETH` |

Four different keys. The retro's single-key wallet ran out of gas mid-run and could not be told apart
from the funding flows; do not repeat that.

## 0. Prerequisites

- `bash .claude/hooks/session-start.sh`, `cd contracts && forge build`, `pnpm --filter @stock-miner/ops sync-abi`.
- Chain profile `ops/chains/robinhood.json` with `rig`, `usdc`, `treasury`, the four `stocks`, and the
  adapters (`oracle`, `eligibility`, or `contracts/deployments/4663-adapters.json` from `deploy-adapters`).
- The fee wallet holds some of each Stock Token and the funder key; the keeper key holds ≥ 0.05 ETH.

## 1. Rehearse on Anvil (ten minutes, every time the code changes)

```
anvil --block-time 1 &
cd ops
GENESIS_DELAY=30 pnpm deploy-rounds demo                      # mocks, 48 rounds funded, players allowlisted
pnpm rounds-admin status
cast rpc evm_increaseTime 3600 && cast rpc evm_mine            # cross a boundary
KEEPER_KEY=<anvil #1> pnpm rounds-keeper --once                # closes round 0
pnpm rounds-admin status                                       # pot, claim window, rigs
NEXT_PUBLIC_DEV_ACCOUNTS=1 pnpm --filter @stock-miner/app dev  # reads deployments/31337-rounds.json
```

Activate, wait for a close, claim inside the 15 minutes, redeem a fraction. Then rehearse the hosting
path: merge → Railway build → variables → domain (docs/RUNBOOK.md §10c) against this deployment, and
confirm the served page shows the Anvil mine before touching mainnet.

## 2. Deploy (once), before the token exists

```
export PRIVATE_KEY=0x… CHAIN_ID=4663 RPC_URL=https://…      # the operator key
pnpm deploy-rounds mainnet --chain robinhood --prelaunch --dry-run   # predicted addresses, paramsHash
pnpm deploy-rounds mainnet --chain robinhood --prelaunch             # three transactions, rig and genesis zero
```

`--prelaunch` deploys the mine without a token or genesis so everything below (verification, hosting,
funding, keeper, watcher, rehearsal against the real addresses) is done days ahead. Players see
"Not live yet". When the token is live:

```
OPERATOR_KEY=0x… pnpm rounds-admin launch --token 0x<RIG> --genesis next-hour        # dry run: prints token symbol, genesis
OPERATOR_KEY=0x… pnpm rounds-admin launch --token 0x<RIG> --genesis next-hour --yes  # one transaction; both fixed for good
```

`--genesis` accepts `next-hour` (default, at least two minutes out), `+<seconds>` or a unix time.
The app, keeper, watcher and admin read the token and genesis from the chain, so no variable or
file changes at launch. If the token address is known at deploy time, omit `--prelaunch`: genesis is
then the next full hour unless `--genesis <unix>` is given. The script refuses invalid params
before spending gas and aborts if the predicted addresses do not match (it means the deployer key sent
another transaction in between: never share the deployer key with a keeper or a bot). It writes
`contracts/deployments/4663-rounds.json`; commit it. Verify the three contracts on Blockscout before
players see wallet warnings:

```
forge verify-contract <mine> src/rounds/RoundMine.sol:RoundMine --chain 4663 --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api --constructor-args $(cast abi-encode …)
```

Then set the hosting variables from the file (`NEXT_PUBLIC_ROUNDS_*`, `ROUNDS_*`; `app/.env.example`,
`ops/chains/README.md`) and confirm `/api/health` and the served mine address before genesis.

## 3. Fund the pots (the fee wallet, daily)

```
FUNDER_KEY=0x… pnpm fund-rounds --stock all --amount <tokens per stock> --rounds 24 --dry-run
FUNDER_KEY=0x… pnpm fund-rounds --stock all --amount <tokens per stock> --rounds 24
FUNDER_KEY=0x… pnpm fund-rounds --reserve 500            # USDG for cash-outs, when low
```

Funding starts with the round after the current one and never changes a running round's pot. Anyone
can fund, so a second wallet topping up is fine. The Pons tax arrives as ETH/WETH or $RIG; the swap
into Stock Tokens is a Robinhood-side action outside this repo, done by the fee wallet holder. What
is not swapped stays with them; the mine only ever sees Stock Tokens.

Sizing: the pot per hour is what was funded per round plus whatever rolled over. `rounds-watch` warns
six rounds before the schedule runs out and when the next round has nothing scheduled.

## 4. Keep and watch

```
KEEPER_KEY=0x… pnpm rounds-keeper --interval 20
ALERT_WEBHOOK_URL=https://… pnpm rounds-watch --interval 60
```

The keeper pokes right after each boundary so the round closes and the claim window opens within
seconds; a missed poke costs nothing but delays the window until the next transaction. It alerts when
its own ETH drops below `KEEPER_MIN_ETH` (0.01 default). Railway configs: `railway/rounds-keeper.json`,
`railway/rounds-watch.json`; each service spells out its whole start command. One keeper per chain.

Normal: `[rounds-keeper] ok round=N closes in ~Ns` and `[rounds-watch] INFO round N pot=… hash=…`.

## 5. Alert responses

| Alert | Meaning | Response |
|---|---|---|
| `nothing scheduled for round N+1` | the schedule ran out | fund (§3); the pot for that hour is only the rollover and the site says so |
| `schedule runs out in ≤ 6 rounds` | same, early | fund |
| `USDG reserve below 1,000` | cash-out reserve thin | `fund-rounds --reserve`; in-kind redemption is unaffected |
| `totalHash == 0 for over an hour` | nobody mining | pots roll over; comms |
| `mine is PAUSED` | guardian paused | confirm it was intentional; unpause within the grace period (30 min) or players halt the mine with `emergencyWithdraw` |
| `mine is HALTED` | operator halt or pause past grace | irreversible; §6 |
| keeper `low gas` | keeper key below threshold | top it up; rounds still close on the next player transaction |

## 6. Stop: halt, rescue, unschedule

All three are the operator's and are stated on the site (DECISIONS 2026-09-08). `rounds-admin`
prints the exact effect and refuses to broadcast without `--yes`.

```
OPERATOR_KEY=0x… pnpm rounds-admin unschedule --stock NVDA --from-round <N>   # take back rounds not yet started
OPERATOR_KEY=0x… pnpm rounds-admin halt --yes                                 # stop for good
OPERATOR_KEY=0x… pnpm rounds-admin rescue --yes                               # after halt: pool and reserve back, minus fragment backing
```

Halt: no round closes after it, no claim window opens, players recover their full deposit with
`emergencyWithdraw`, fragments already claimed stay redeemable, and `rescue` returns everything else
(retryable per asset if a Stock Token hook refuses the operator; allowlist and run again).

## 7. Checklist before genesis

1. Anvil rehearsal (§1) passed on this commit, including the hosting path.
2. Deployment file committed; contracts verified; hosting variables set; served page shows the mine.
3. Fee wallet funded ≥ 24 rounds; reserve ≥ a day of expected cash-outs.
4. Keeper and watcher running on their own keys with alerts wired; keeper ETH ≥ 0.05.
5. One operator on the Railway project and the branch for the day; nobody else pushes or edits.
6. Site notices live: fee-funded pots, operator halt / unschedule, 15-minute claims and rollover.
