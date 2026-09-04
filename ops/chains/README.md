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
| `usdc` | The USDC used by `RedemptionVault.cashOut` (6 decimals assumed by the vault) | §10.1 |
| `oracle` | An `IPriceOracle` adapter: `usdPrice(stock) → (price 1e8, updatedAt)`. Write one per feed provider; `MockPriceOracle` is the reference shape. Staleness is capped at 1h in the vault | §10.5 oracle |
| `eligibility` | An `IEligibility` adapter. `AllowlistEligibility` (owner = treasury) if the issuer publishes a list; otherwise an adapter over the Stock Token's own hook/registry | §10.2 Stock Token hooks, open question Q1 |
| `treasury` | Receives activation and exit fees, is the pause guardian, receives sweeps. A multisig | docs/07 |
| `stocks` | Stock Token addresses per symbol; `plan` orders blocks as listed in the params file | §10.2, Q1 |

Fill-in order: chain and explorer, then tokens, then oracle and eligibility adapters (deploy and test
them against one known-eligible and one ineligible wallet, docs/08 §4), then `treasury`.

Never put private keys here. Scripts read `PRIVATE_KEY` / `OPERATOR_KEY` / `KEEPER_KEY` from the
environment.
