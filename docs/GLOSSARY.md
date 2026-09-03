# Glossary

| Term | Meaning |
|---|---|
| Season | One deployment of the mine: fixed parameters, 24 hours of mining, then permanent close and a redemption window. |
| Mine | The `SeasonMine` contract and the game state it holds. |
| Rig | A single stake deposit with its upgrades, heat and hashrate. A wallet can own many. |
| Stake weight (`W`) | RIG-equivalent value of a rig's deposit, fixed at activation. LP deposits get a bonus. |
| Hashrate (`H`) | On-chain number, `W × gpuMult + overclock boost`. Determines share of emissions. Nothing is actually hashed. |
| Virtual mining | Emission of rewards pro rata to hashrate over time; no proof of work. |
| GPU tier | Permanent hashrate multiplier bought by burning RIG. |
| Cooling tier | Permanent upgrade that lowers heat per overclock and raises heat removed at each block boundary. |
| Overclock | Temporary +50% base hashrate for the rest of the current block; costs RIG and heat. |
| Heat | 0–100 per rig; rises with overclocks, falls at block boundaries; blocks overclocks when full. |
| Reward block | One of four 6-hour windows, each with its own stock and fragment pool. |
| Unlock | The moment a reward block ends and its fragments become claimable. |
| Fragment | ERC-1155 unit; 1,000,000 fragments = 1 Stock Token of that block's stock. Non-transferable in v1. |
| Stock Token | Tokenized equity/ETF on Robinhood Chain (e.g. NVDAx). May carry transfer restrictions. |
| Redemption | Burning fragments for Stock Tokens (eligible wallets) or USDC (cash-out). |
| Close | End of block 4. Staking and upgrades stop forever; withdrawals open. |
| Sweep | Operator moving unclaimed prize assets to the treasury after the redemption window. |
| Accumulator (`accPerHash`) | Rewards-per-unit-hash counter used for O(1) pro-rata accounting. |
