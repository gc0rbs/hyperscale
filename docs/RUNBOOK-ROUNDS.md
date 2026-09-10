# Hyperscaler – round mine runbook

How the continuous hourly mine (`docs/13-ROUNDS.md`) is deployed, funded, kept and stopped, using only
the scripts in this repo. It replaces the season runbook (`docs/RUNBOOK.md`), which stays only for
its hosting section (§10) and for season mode.

Principles: one deployment, no launch nights, every irreversible action confirmed with its exact
parameters, one operator per environment.

## Roles and keys (environment only, never in files or chat)

| Role | Env var | Powers |
|---|---|---|
| Deployer | `PRIVATE_KEY` | a gas-only key that deploys once; pass `--operator` so it holds no power afterwards |
| Operator | `OPERATOR_KEY` (only where it is needed) | the mine's `operator` and the FeeFunder owner: `launch` (once), `halt`, vault `rescue`, `set-source`, `set-cuts`. Its key never has to touch a hosted environment: each of those is one transaction, also doable from the wallet through the explorer |
| FeeFunder (contract) | none | the Pons V2 creator fee recipient: `flush` sweeps and claims the creator fees from the Pons escrow, swaps and funds. No key |
| Flusher | `FLUSHER_KEY` (the keeper key is fine) | calls `FeeFunder.flush` every few minutes with a quoted slippage bound; holds gas only |
| Fee wallet `0xC8156Dc02630fF103a7cBCbCc1DDe2673515d1c0` | `FUNDER_KEY` | optional: any wallet holding Stock Tokens can `fund` directly with `fund-rounds`; the client's wallet |
| Guardian | `GUARDIAN_KEY` | the `treasury` address: `pause`, `unpause`. Receives activation and exit fees |
| Keeper | `KEEPER_KEY` | its own funded key; sends `poke()` at round boundaries. Alerts below `KEEPER_MIN_ETH` |

Four different keys: a single wallet doing everything runs out of gas mid-run and cannot be told
apart from the funding flows.

## 0. Prerequisites

- `bash .claude/hooks/session-start.sh`, `cd contracts && forge build`, `pnpm --filter @stock-miner/ops sync-abi`.
- Chain profile `ops/chains/robinhood.json` with `rig`, `usdc`, `treasury`, the four `stocks`, and the
  adapters (`oracle`, `eligibility`, or `contracts/deployments/4663-adapters.json` written by `deploy-adapters`).
- `ops/chains/robinhood.json` `pools` names the WETH pool per stock (discovered 2026-09-08); the keeper
  and flusher keys hold ≥ 0.05 ETH each.

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
pnpm deploy-rounds mainnet --chain robinhood --prelaunch --operator 0x<operator wallet> --flusher 0x<keeper>   # four transactions, rig and genesis zero
```

The shard metadata URL defaults to `https://www.hyperscaling.xyz/api/frag/{id}.json` (the client's domain,
2026-09-09) and is baked into `StockFragments` for good; override with `--base-uri` or `FRAG_BASE_URI`
only if the domain changes before the deploy.

`--prelaunch` deploys the mine without a token or genesis so everything below (verification, hosting,
funding, keeper, watcher, rehearsal against the real addresses) is done days ahead. Players see
"Not live yet". The script also deploys the **FeeFunder** and prints its address (the creator fee
recipient to enter at the Pons launch; wired after it, §2b), and allow the flusher with
`OPERATOR_KEY=0x… pnpm rounds-admin set-flusher --address <keeper address> --yes` (or pass
`--flusher` to the deploy). When the token is live:

```
OPERATOR_KEY=0x… pnpm rounds-admin launch --token 0x<RIG> --genesis next-hour        # dry run: prints token symbol, genesis
OPERATOR_KEY=0x… pnpm rounds-admin launch --token 0x<RIG> --genesis next-hour --yes  # one transaction; both fixed for good
```

`--genesis` accepts `next-hour` (default, at least two minutes out), `+<seconds>` or a unix time.

### 2b. Wire the Pons fees (at the token launch, then right after it)

Pons V2 pays the creator in ETH through its fee escrow (DECISIONS 2026-09-10, second entry). At the
launch on Pons V2 (factory `0x7eD5…EC7e`):

- **Creator fee wallet / recipient: the FeeFunder address** (`feeFunder` in
  `contracts/deployments/4663-rounds.json`, `FEE_FUNDER_ADDRESS` on Railway). Not a person's wallet.
- **Creator tax:** the client's choice, up to 10%; this plus 70% of the base fee is the pot.
- **Buyback: off.** With buyback on, part of the creator fee is locked as a five-year vest that the
  funder cannot claim.
- The recipient can be changed later only by the current recipient (`transferCreatorFeeRecipient`)
  or by the Pons owner with a 3-day timelock, so get it right at launch.

Then, from the operator:

```
OPERATOR_KEY=0x… pnpm rounds-admin set-source --token 0x<VRAM>          # dry run: prints the launch record and the three collect calls
OPERATOR_KEY=0x… pnpm rounds-admin set-source --token 0x<VRAM> --yes    # setCollects on the funder
pnpm rounds-admin status                                                # "3 collect calls wired", ETH claimable in the escrow
FLUSHER_KEY=0x… pnpm flush-fees --once --dry-run                        # what the next flush would claim and buy
```

To pay part of the fees to wallets (client decision 2026-09-10: of a 3% creator tax, 2% to the game
and 0.5% to each of two wallets, i.e. one sixth each of what the funder receives):

```
OPERATOR_KEY=0x… pnpm rounds-admin set-cuts --cuts 0x<walletA>:1667,0x<walletB>:1667 --yes   # ETH, off the top of every flush
OPERATOR_KEY=0x… pnpm rounds-admin set-cuts --cuts "" --yes                                  # clear: pots get 100%
```

Cuts are paid in ETH before the swaps; the pots get the remainder. Use plain wallets, not
contracts that reject ETH (such a wallet reverts every flush until re-pointed).

`set-source` reads the launch from the factory (curve, recipient, tax, buyback, phase), refuses a
launch not quoted in ETH, warns if the recipient is not the funder or buyback is on, derives the
Uniswap v4 pool id from the launch's fee, tick spacing and the meme hook, and sets the collect calls
`curve.sweepFees(0)` → `hook.sweepPoolFees(poolId, 0, 0)` → `escrow.claim()`. From then on every flush
sweeps what it may (Pons' own sweep operator sweeps the rest on its schedule) and claims.
The app, keeper, watcher and admin read the token and genesis from the chain, so no variable or
file changes at launch. If the token address is known at deploy time, omit `--prelaunch` and pass `--rig 0x<VRAM>` (the
chain profile's `rig` is never used for the round mine): genesis is
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

## 3. Fund the pots (automatic)

```
FLUSHER_KEY=0x… pnpm flush-fees --once --dry-run            # quote: what a flush would buy now
FLUSHER_KEY=0x… pnpm flush-fees --interval 300               # the service: every 5 min, when ≥ 0.002 ETH waits
FUNDER_KEY=0x… pnpm fund-rounds --stock all --amount 0.5     # optional: fund Stock Tokens by hand
FUNDER_KEY=0x… pnpm fund-rounds --reserve 500                # USDG for cash-outs, when low
```

Pons credits the FeeFunder's creator fees in its escrow. `flush-fees` (Railway
`railway/flush-fees.json`) simulates a flush every five minutes; when it would spend at least
`--min-eth` of WETH it takes a `--slippage-bps` (1%) haircut of the simulated amounts as the bounds
and sends: sweep, claim, four swaps on the WETH pools, four `fund` calls, one transaction. The stock lands in the running round's pot at once and the pot is locked at
the close, so the first hour pays out whatever came in during it. No calendar, no key holding fees,
nothing to do for a project that runs two hours or two weeks. Three slippage reverts in a row alert:
a pool moved or thinned; re-point it with `setLegs` or raise the haircut.

`rounds-watch` warns when a round is past its half-way point with no fees in yet.

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
| `no fees in yet: round N pot is zero` | half the round gone, nothing funded | check the FeeFunder's pending ETH (`rounds-admin status`) and the flusher service (§3); the round pays only its rollover otherwise |
| flusher `slippage 3× in a row` | a pool moved more than the haircut between quote and send, or is too thin | `setLegs` to a deeper pool, or raise `--slippage-bps` |
| flusher `mine is HALTED; … waits` | fees keep accruing after a halt | owner sweeps the FeeFunder (`sweep`) |
| `USDG reserve below 1,000` | cash-out reserve thin | `fund-rounds --reserve`; in-kind redemption is unaffected |
| `totalHash == 0 for over an hour` | nobody mining | pots roll over; comms |
| `mine is PAUSED` | guardian paused | confirm it was intentional; unpause within the grace period (30 min) or players halt the mine with `emergencyWithdraw` |
| `mine is HALTED` | operator halt or pause past grace | irreversible; §6 |
| keeper `low gas` | keeper key below threshold | top it up; rounds still close on the next player transaction |

## 6. Stop: halt and rescue

Both are the operator's and are stated on the site (DECISIONS 2026-09-08). `rounds-admin` prints the
exact effect and refuses to broadcast without `--yes`.

```
OPERATOR_KEY=0x… pnpm rounds-admin halt --yes                                 # stop for good
OPERATOR_KEY=0x… pnpm rounds-admin rescue --yes                               # after halt: pool and reserve back, minus fragment backing
```

Halt: no round closes after it, no claim window opens, players recover their full deposit with
`emergencyWithdraw`, fragments already claimed stay redeemable, and `rescue` returns everything else
(retryable per asset if a Stock Token hook refuses the operator; allowlist and run again).

## 7. Checklist before genesis

1. Anvil rehearsal (§1) passed on this commit, including the hosting path.
2. Deployment file committed; contracts verified; hosting variables set; served page shows the mine.
3. The FeeFunder is the creator fee recipient on Pons (§2b), its collect calls are wired and the flusher is running; reserve sized to expected cash-outs.
4. Keeper and watcher running on their own keys with alerts wired; keeper ETH ≥ 0.05.
5. One operator on the Railway project and the branch for the day; nobody else pushes or edits.
6. Site notices live: fee-funded pots, operator halt, 15-minute claims and rollover.
7. After the token launch: `set-source` done, `feeRedirects(token)` prints the funder, first `flush-fees --once --dry-run` shows a quote.
