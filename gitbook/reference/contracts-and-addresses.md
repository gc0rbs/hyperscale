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
| $VRAM | Published at launch on Pons |
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

## Season contracts

Each season deploys three contracts. Their addresses are published with the season and shown in the app's footer and on the explorer.

| Contract | Role |
| --- | --- |
| `SeasonMine` | Stakes, upgrades, work-based block discovery, per-rig accounting, claims, exits, pause |
| `StockFragments` | The fragments: an ERC-1155 with one id per block, minted by the mine, burned by the vault, non-transferable |
| `RedemptionVault` | Holds the Stock Tokens and the USDG reserve; redeem, cash out, sweep |
| `SeasonFactory` | Validates parameters and deploys the three above, once per season |
| `OpenEligibility`, `ChainlinkOracle` | Adapters: who may redeem in kind (everyone, on mainnet) and the cash-out price |

## Verifying a season

1. Read `params()` on the `SeasonMine` contract in the explorer. It returns every parameter listed under [Season parameters](season-parameters.md).
2. Compare with the published season file; the deployment records the hash of the encoded parameters.
3. Check `phase()` is `Open` or `PreOpen` and `closeX()` is zero for a live season.
4. Check the vault holds the pool: each Stock Token's `balanceOf(vault)` should equal the pool amount, and USDG's should equal the reserve.
5. Check `pause` is the only privileged function. The contract source is verified on the explorer; there is no `owner`, no setter, no proxy.

## Source

The contracts, tests, simulation, app and this documentation are in the project repository. Interfaces are in `specs/contracts/`, the technical specification in `docs/05-TECH-SPEC-CONTRACTS.md`, and the audit hand-off in `docs/AUDIT-PACKAGE.md`.
