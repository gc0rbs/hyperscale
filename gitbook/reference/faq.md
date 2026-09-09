# FAQ

**Is my stake at risk?**
Your stake is held by the mine and returned in full at close, or minus 3% if you exit early. The contracts cannot move it anywhere else. What you can lose is what you burn on upgrades, the exit fee, and unclaimed fragments if a season is cancelled or you miss the redemption window.

**Do I have to keep the browser open?**
No. Work is credited on chain by the clock. Come back to claim, upgrade or re-buy overclocks.

**Does more players joining reduce my rewards?**
No. Each block pays a fixed rate per unit of work and your rig is paid for its own work. More hashrate makes the block end sooner, so you spend less time in it, but every second you mined was paid at the same rate. Your *share* of the total goes down; your pay per second does not.

**How long is a season?**
As long as it takes to find four blocks, with a hard cap (default six hours). The default sizing plans for about three hours. The app shows an estimate that moves with the total hashrate.

**What if block 4 is never found?**
The cap closes the season. Blocks already found pay in full, the running block pays what was mined, stakes return, and the unmined part of the pool rolls into a later season.

**Can the operator change the rules mid-season?**
No. The contracts have no setters and no proxies. The only admin power is pause, and a pause longer than the grace period lets every player withdraw.

**What happens if the mine is paused?**
You cannot act, but your rig keeps earning at its current hashrate. If the pause outlives the grace period (30 minutes default), you can withdraw your full stake, which cancels the season and forfeits unclaimed fragments. Claim as blocks are found to avoid that.

**Can I get my upgrade $VRAM back if I exit or the season is cancelled?**
No. Upgrades are sent to the burn address the moment you buy them.

**Can I add to a rig's stake?**
No. Stake is fixed at activation because upgrade prices are a percentage of it. Open another rig to add capital.

**Can I sell or send fragments?**
No. Fragments are non-transferable in this version. Redeem them for the Stock Token or cash out for USDG inside the 30-day window after close.

**Which is better, redeem in kind or cash out?**
In kind gives you the Stock Token at exactly one token per million fragments with no fee. Cash-out pays the Chainlink price minus 1% in USDG and depends on a fresh price and the reserve. Most players who want the stock should redeem in kind.

**Why is cash-out unavailable right now?**
Either the Chainlink price is older than 26 hours (markets closed for a long stretch) or the USDG reserve is spent. In-kind redemption is unaffected.

**I am in the US / Canada / UK / Switzerland. Can I play?**
No. Robinhood Stock Tokens are not available to persons in those jurisdictions and neither is Hyperscaler.

**Is this gambling?**
There is no randomness. Outcomes are a deterministic function of stake, spend and everyone else's participation. Whether a prize competition without chance is regulated depends on your jurisdiction; the terms govern.

**Where are the contracts?**
See [Contracts and addresses](contracts-and-addresses.md). Season addresses are published with each season and verified on the explorer.

**How do I verify the season is what the app says?**
Read `params()` on the mine contract and the vault's token balances on the explorer. The steps are under [Verifying a season](contracts-and-addresses.md#verifying-a-season).
