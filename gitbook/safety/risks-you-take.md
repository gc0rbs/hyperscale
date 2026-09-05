# Risks you take

## Market risk

* **$RIG** is a small-cap token with a fixed supply. Its price can fall while your stake is locked; the stake is returned in $RIG, not in dollars.
* **Stock Tokens** track the price of a share or index. The fragments you earn are worth whatever the underlying is worth when you redeem, and they do not pay dividends or carry voting rights.
* Your **burn** is priced in $RIG at the time of purchase. If $RIG rises afterwards, you burned more value than it looked like.

## Game risk

* **Pace.** If far more hashrate joins than you expected, the season is over sooner and permanent upgrades pay back less. If far less joins, the season heads for the cap and later blocks may never be found. Both are visible in the ETA; neither can be changed.
* **Timing.** Overclocks cover a fixed slice of the mine. Buying one right before a block is found puts most of it into the next block, which is fine, unless it was block 4.
* **Attention.** In a fast season you may need to come back every ten to twenty minutes to keep overclocks running. Long-haul mode exists for the opposite case.

## Contract and infrastructure risk

* **Bugs.** The contracts are tested as described under [Testing and audits](testing-and-audits.md) and reviewed externally, and they are immutable, so a bug found after launch cannot be patched in a running season. The mine holds only deposits and minting is capped at the pool, which bounds what a bug can do, but not to zero.
* **Chain.** Robinhood Chain is a rollup with a sequencer. If it stalls you cannot act until it resumes; work keeps accruing by timestamp.
* **Oracle.** Cash-out depends on Chainlink. In-kind redemption does not.
* **Operator.** The treasury key can pause. The grace period means a pause can end a season and forfeit unclaimed fragments, but cannot take stakes.

## Legal risk

Stock Tokens are regulated instruments not available in some jurisdictions, and Stock Miner is offered under the same restriction. Using the site through a VPN from a restricted region breaks the terms and may break your local law. Nothing in these docs or the app is investment advice.

## What we ask of you

Stake what you can leave locked for the length of a season, burn only what you would spend on a game, claim as blocks are found, and redeem inside the window.
