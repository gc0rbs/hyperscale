# Contracts and addresses

## Chain

| | |
| --- | --- |
| Network | Robinhood Chain, chain id 4663 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Testnet | chain id 46630, `https://rpc.testnet.chain.robinhood.com` |

## Tokens

| Token | Address |
| --- | --- |
| $VRAM | Published at launch on Pons, and readable as `params().rig` on the mine once launched |
| USDG (cash-out quote token, 6 decimals) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| NVDA Stock Token | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` |
| MU Stock Token | `0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD` |
| SNDK Stock Token | `0xB90A19fF0Af67f7779afF50A882A9CfF42446400` |
| QQQ Stock Token | `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68` |
| Burn address | `0x000000000000000000000000000000000000dEaD` |

## Chainlink feeds used for cash-out

| Feed | Address |
| --- | --- |
| NVDA / USD | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` |
| MU / USD | `0x425EEFdCf05ed6526C3cE61Af99429A228a6d596` |
| SNDK / USD | `0xfb133Fa4B7b385802B693a293606682Df47109A3` |
| QQQ / USD | `0x80901d846d5D7B030F26B480776EE3b29374C2ae` |

Feeds are 8-decimal USD prices with a 24-hour heartbeat and a 0.5% deviation trigger, and they include the Stock Token's multiplier.

The oracle adapter's stock-to-feed map is immutable and readable on the explorer once deployed.

## Game contracts

The game is one permanent deployment of four contracts. Their addresses are published with the launch and shown in the app's footer and on the explorer.

| Contract | Role |
| --- | --- |
| `RoundMine` | Stakes, upgrades, per-round work accounting, claims, exits, pause, the one-shot launch and halt |
| `StockFragments` | The shards: an ERC-1155 with one id per stock, minted by the mine, burned by the vault, non-transferable |
| `RoundVault` | Holds the Stock Tokens and the USDG reserve; redeem, cash out, rescue after a halt |
| `FeeFunder` | The Pons tax recipient: swaps the ETH it receives into the four Stock Tokens and funds the running round |
| `OpenEligibility`, `ChainlinkOracle` | Adapters: who may redeem in kind (everyone, on mainnet) and the cash-out price |

## Verifying the game

1. Read `params()` on the `RoundMine` contract in the explorer. It returns every parameter: the token, the stocks, the round and claim lengths, the fees and the upgrade tables.
2. Check `launched()` is true and `halted()` is false for a live game, and `currentRound()` advances every hour from `params().genesis`.
3. Check the vault holds the pots: each Stock Token's `balanceOf(vault)` is at least that stock's running pot plus the latest closed round's unclaimed pot plus the stock behind every unredeemed shard.
4. Check the privileged functions are exactly `pause` and `unpause` (guardian), `launch` (once) and `halt` (operator). The contract source is verified on the explorer; there is no setter for any parameter and no proxy.

## Source

The contracts, tests, app and this documentation are in the project repository. Interfaces are in `specs/contracts/`, the round design in `docs/13-ROUNDS.md`, and the audit hand-off in `docs/AUDIT-PACKAGE.md`.
