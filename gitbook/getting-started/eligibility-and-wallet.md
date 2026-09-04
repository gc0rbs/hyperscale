# Eligibility, wallet and network

## Who can play

Stock Miner pays out Robinhood Stock Tokens. Those tokens are not available to persons in the **United States, Canada, the United Kingdom or Switzerland**, and neither is Stock Miner. The site blocks those regions by network location, and the [terms](../reference/terms.md) make eligibility your responsibility. The contracts themselves are permissionless. The restriction is legal, not technical, and you should treat it as binding.

## Network

| | |
| --- | --- |
| Chain | Robinhood Chain (Arbitrum Orbit), chain id **4663** |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` |
| Gas | ETH |
| Quote token for cash-out | USDG (6 decimals) |

If your wallet is on another network, the app shows a **Switch network** button. Nothing is sent until the wallet is on Robinhood Chain.

## Wallet

Any injected wallet (MetaMask, Rabby, and the like) works. WalletConnect is available for mobile wallets. The app never asks for anything other than transaction signatures on the season contracts and token approvals for $RIG.

{% hint style="danger" %}
If you claim from a **smart-contract wallet**, it must accept ERC-1155 tokens (implement `onERC1155Received`). Fragments are ERC-1155 tokens and the claim reverts otherwise. Ordinary wallets are unaffected.
{% endhint %}

## Getting $RIG

$RIG is a plain ERC-20 launched on **Pons** with a fixed supply of one billion tokens. After graduation it trades on the RIG/WETH Uniswap v3 pool on Robinhood Chain. You need $RIG for the stake, the 1% activation fee, and any upgrades you choose to buy, plus a little ETH for gas.

## Approvals

Activating a rig and buying upgrades both move $RIG from your wallet, so the app asks for an approval first. You can approve the exact amount each time or a larger allowance for the season. Upgrades are transferred to the burn address `0x000000000000000000000000000000000000dEaD` directly from your wallet.
