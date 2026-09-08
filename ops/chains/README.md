# Chain profiles

One JSON per target chain, read by `ops plan` and the runbook. `anvil.json` is complete.
`robinhood.json` is mainnet (chain 4663) with the chain, explorer, Uniswap v3 and Pons addresses
filled and the season addresses still zero; `robinhood-testnet.json` is a placeholder set. Every zero
address below has to be filled in once the corresponding assumption in `docs/01-PRD.md` §10 is verified.

$RIG is launched on Pons: a plain ERC-20 (1B supply, 18 decimals, no burn function), graduating to a
Uniswap v3 RIG/WETH pool whose position is an NFT held by the Pons locker. The mine burns by
transferring to the dead address, and LP staking is off (`lpToken` zero, decided 2026-09-04).

| Field | What it is | Depends on |
|---|---|---|
| `chainId`, `rpcUrl` | Robinhood Chain testnet id and an RPC (archive access preferred: `plan` samples 24h of LP state) | §10.1 chain is an Arbitrum Orbit L2 with standard JSON-RPC |
| `explorerApi` | Blockscout/Etherscan-style verify endpoint; also `[etherscan]` in `contracts/foundry.toml` | §10.1 |
| `rig` | The $RIG ERC-20: the graduated Pons token. Any standard ERC-20 works; upgrade spend is transferred to `0x…dEaD`. `contracts/src/tokens/RIG.sol` is the test/dev token | §10.4 |
| `lpToken`, `lpPairKind` | Leave zero: the Pons pool is Uniswap v3 (NFT positions), so LP staking is off in v1 (Q3 closed). The v2-shape sampling in `plan` stays for a future full-range wrapper token | §10.3 |
| `usdc` | The quote token for `RedemptionVault.cashOut`: USDG on Robinhood Chain (`0x5fc5…d168`); the vault reads its `decimals()` at construction | §10.1 |
| `oracle` | `ChainlinkOracle(stocks, feeds)` over the per-token Chainlink feeds (addresses from docs.chain.link, network robinhood; fill `feeds` first). Feeds: 8 decimals, 24 h heartbeat, 0.5% deviation; the vault's staleness cap is 26 h | §10.5 oracle |
| `eligibility` | `OpenEligibility`: Robinhood Stock Tokens have no on-chain restriction; the legal one (no U.S., CA, UK, CH persons) is a front-end geo-fence | §10.2, Q1 closed |
| `treasury` | Receives activation and exit fees, is the pause guardian, receives sweeps. A single operator key by the client's decision (hardware wallet, not the deployer or keeper key) | docs/07 |
| `stocks` | Canonical Robinhood Stock Token addresses (season 1: NVDA, MU, SNDK, QQQ, from `api.robinhood.com/rhj/assets`); `plan` orders blocks as listed in the params file | §10.2 |

Fill-in order: chain and explorer, then tokens, then oracle and eligibility adapters (deploy and test
them against one known-eligible and one ineligible wallet, docs/08 §4), then `treasury`.

Never put private keys here. Scripts read `PRIVATE_KEY` / `OPERATOR_KEY` / `KEEPER_KEY` /
`GUARDIAN_KEY` / `FUNDER_KEY` from the environment.

## Round mine (docs/13) without a deployments mount

`deploy-rounds` writes `contracts/deployments/<chainId>-rounds.json`, which `fund-rounds`,
`rounds-keeper`, `rounds-watch` and `rounds-admin` read. Hosts without that file (the Railway
`rounds-keeper` / `rounds-watch` services, `railway/rounds-*.json`) set these instead, alongside
`CHAIN_ID` and `RPC_URL`:

| Env | Value from the deployment file |
|---|---|
| `ROUNDS_MINE_ADDRESS` | `mine` (required) |
| `ROUNDS_VAULT_ADDRESS` | `vault` |
| `ROUNDS_FRAGMENTS_ADDRESS` | `fragments` |
| `STOCK_ADDRESSES` | `stocks`, comma-separated in stock-index order |
| `STOCK_SYMBOLS` | `symbols`, comma-separated (optional; labels only) |
| `USDC_ADDRESS` | `usdc` (the USDG reserve token) |
| `OPERATOR_ADDRESS`, `RIG_ADDRESS`, `ORACLE_ADDRESS`, `ELIGIBILITY_ADDRESS` | optional |
| `GENESIS` | `genesis` (unix seconds, start of round 0) |
| `ROUND_SECONDS` / `CLAIM_SECONDS` | `roundSeconds` / `claimSeconds` (default 3600 / 900) |

Service knobs: `KEEPER_KEY`, `KEEPER_MIN_ETH` (default 0.01; low-gas alert), `ALERT_WEBHOOK_URL`,
`ALERT_MIN_LEVEL`, `ALERT_REPEAT_SECONDS`.
