# Glossary

| Term | Meaning |
|---|---|
| Season | One deployment of the mine: fixed parameters, four reward blocks, then permanent close and a redemption window. Length is an outcome of participation. |
| Mine | The `SeasonMine` contract and the game state it holds. |
| Rig | A single stake deposit with its upgrades, heat and hashrate. A wallet can own many. |
| Stake weight (`W`) | RIG-equivalent value of a rig's deposit, fixed at activation. LP deposits get a bonus. |
| Hashrate (`H`) | On-chain number, `W × gpuMult + overclock boost`. Nothing is actually hashed. |
| Work | `hashrate × seconds`. The mine's unit of progress. |
| Difficulty (`D_b`) | Amount of work that finds block *b*. Fixed at season creation. |
| Pay rate (`r_b`) | `pool_b / D_b`: fragments per hash-second, fixed per block, the same for every rig. |
| Found | A block is found the instant its cumulative work reaches its difficulty. Its fragments become claimable. |
| Shift | `1/shiftsPerBlock` of a block's difficulty (default 8 per block). Overclocks expire and heat decays at shift ends. |
| Virtual mining | Paying rewards per unit of virtual work; no proof of work. |
| GPU tier | Permanent hashrate multiplier bought by burning RIG. |
| Cooling tier | Permanent upgrade that lowers heat per overclock and raises heat removed at each shift end. |
| Overclock | +50% base hashrate per active overclock until the end of the next shift; costs RIG and heat. |
| Heat | 0–100 per rig; rises with overclocks, falls at shift ends; blocks overclocks when full. |
| Reward block | One of four pools, each with its own stock and difficulty. |
| Fragment | ERC-1155 unit; 1,000,000 fragments = 1 Stock Token of that block's stock. Non-transferable in v1. |
| Stock Token | Tokenized equity/ETF on Robinhood Chain (e.g. NVDA). May carry transfer restrictions. |
| Redemption | Burning fragments for Stock Tokens (eligible wallets) or USDC (cash-out). |
| Close | The instant block 4 is found, or the cap is reached. Staking and upgrades stop forever; withdrawals open. |
| Exit | Leaving mid-season for a fee; deposit returned, rig stops, earned fragments kept. |
| Cap | `maxDuration` after open at which the mine closes if block 4 has not been found. Shown as the latest possible end; rewards never depend on it. |
| ETA | `remaining work / current total hash`, an estimate the app shows for next shift, block and close. |
| Planned pace | The participation the operator sized difficulty for; used only for communication. |
| Poke | Public function that advances the mine's boundary accounting; anyone can call it. |
| Sweep | Operator moving unclaimed prize assets to the treasury after the redemption window. |
| X-time | Timestamp × 1e18, used on-chain so shift boundaries are exact. |
