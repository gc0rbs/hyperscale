# Chain profiles

One JSON per target chain, read by `ops plan` and the runbook. `anvil.json` is complete. The
`robinhood-testnet.json` profile is a placeholder set; every zero address below has to be filled in
once the corresponding assumption in `docs/01-PRD.md` §10 is verified.

| Field | What it is | Depends on |
|---|---|---|
| `chainId`, `rpcUrl` | Robinhood Chain testnet id and an RPC (archive access preferred: `plan` samples 24h of LP state) | §10.1 chain is an Arbitrum Orbit L2 with standard JSON-RPC |
| `explorerApi` | Blockscout/Etherscan-style verify endpoint; also `[etherscan]` in `contracts/foundry.toml` | §10.1 |
| `rig` | The $RIG ERC-20. Must be burnable via `burnFrom` (OpenZeppelin `ERC20Burnable`) because upgrades burn from the player; `contracts/src/tokens/RIG.sol` is the reference deployment | §10.4 |
| `lpToken`, `lpPairKind` | The RIG/USDC pool token the mine accepts. `plan` reads `getReserves`/`totalSupply`/`token0` (Uniswap v2 shape). For a v3/CL pool, LP staking is not supported in v1 (fungible LP required); set `lpToken` to the zero address and `--lp-bonus 0` | §10.3 DEX, open question Q3 |
| `usdc` | The USDC used by `RedemptionVault.cashOut` (6 decimals assumed by the vault) | §10.1 |
| `oracle` | An `IPriceOracle` adapter: `usdPrice(stock) → (price 1e8, updatedAt)`. Write one per feed provider; `MockPriceOracle` is the reference shape. Staleness is capped at 1h in the vault | §10.5 oracle |
| `eligibility` | An `IEligibility` adapter. `AllowlistEligibility` (owner = treasury) if the issuer publishes a list; otherwise an adapter over the Stock Token's own hook/registry | §10.2 Stock Token hooks, open question Q1 |
| `treasury` | Receives activation and exit fees, is the pause guardian, receives sweeps. A multisig | docs/07 |
| `stocks` | Stock Token addresses per symbol; `plan` orders blocks as listed in the params file | §10.2, Q1 |

Fill-in order: chain and explorer, then tokens, then oracle and eligibility adapters (deploy and test
them against one known-eligible and one ineligible wallet, docs/08 §4), then `treasury`.

Never put private keys here. Scripts read `PRIVATE_KEY` / `OPERATOR_KEY` / `KEEPER_KEY` from the
environment.
