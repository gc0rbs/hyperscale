# Glossary

| Term | Meaning |
| --- | --- |
| Season | One deployment of the mine: fixed parameters, four reward blocks, then permanent close and a redemption window. Length is an outcome of participation |
| Mine | The `SeasonMine` contract and the game state it holds |
| Rig | A single stake deposit with its upgrades, heat and hashrate. A wallet can own many |
| Stake weight (W) | The RIG value of a rig's deposit, fixed at activation |
| Hashrate (H) | An on-chain number: stake × GPU multiplier + overclock boost. Nothing is actually hashed |
| Work | Hashrate × seconds. The mine's unit of progress |
| Difficulty | The amount of work that finds a block. Fixed at creation |
| Pay rate | Pool ÷ difficulty: fragments per hash-second, fixed per block, the same for every rig |
| Found | A block is found the instant its cumulative work reaches its difficulty. Its fragments become claimable |
| Shift | One eighth of a block's work. Overclocks expire and heat decays at shift ends |
| Virtual mining | Paying rewards per unit of virtual work; no proof of work |
| GPU tier | Permanent hashrate multiplier bought by burning $RIG |
| Cooling tier | Permanent upgrade that lowers heat per overclock and raises heat removed at each shift end |
| Overclock | +50% base hashrate per active overclock until the end of the next shift; costs $RIG and heat |
| Heat | 0 to 100 per rig; rises with overclocks, falls at shift ends; blocks overclocks when full |
| Reward block | One of four pools, each with its own stock and difficulty |
| Fragment | ERC-1155 unit; 1,000,000 fragments = 1 Stock Token of that block's stock. Non-transferable |
| Stock Token | Robinhood's tokenised stock or ETF on Robinhood Chain (NVDA, MU, SNDK, QQQ) |
| Redemption | Burning fragments for Stock Tokens (in kind) or USDG (cash-out) |
| Close | The instant block 4 is found, or the cap is reached. Staking and upgrades stop forever; withdrawals open |
| Exit | Leaving mid-season for a fee; deposit returned, rig stops, earned fragments kept |
| Cap | The latest possible end of a season, fixed at creation. Rewards never depend on it |
| ETA | Remaining work ÷ current total hash: the app's estimate for the next shift, block and close |
| Planned pace | The participation the operator sized difficulty for; communication only |
| Poke | Public function that advances the mine's bookkeeping; anyone can call it, it changes no outcome |
| Grace period | How long a pause may last before players can emergency-withdraw (30 minutes default) |
| Sweep | Moving unclaimed prize assets to the treasury after the redemption window |
| Treasury | The operator's wallet: receives fees and sweeps, holds the pause power |
| Burn address | `0x…dEaD`, where upgrade spend is sent |
