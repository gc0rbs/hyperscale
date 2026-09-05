# Known limitations

Accepted, deliberate, and disclosed. None of these is a bug, but each is something a careful player should know.

| Limitation | Why it is this way |
| --- | --- |
| **Pause does not stop the clock.** Work accrues for everyone during a pause; you cannot overclock, exit or claim until it ends, unless the mine has closed, in which case claims and withdrawals go through | A pause must not alter rewards. The grace period bounds how long you can be locked out |
| **A cancelled mine is frozen** at the instant of cancellation: no further shifts, work or close | Later emergency withdrawals settle against one fixed state |
| **The close must be recorded by a transaction.** The mine knows it is closed the instant the work is done, but withdrawals and redemption read the recorded close; the keeper, any player transaction, or the "Record the close" button records it | Contracts cannot act on their own |
| **Cancellation forfeits unclaimed fragments** and sends the pool to the treasury | A season whose accounting is in doubt should not keep minting. Claim as blocks are found |
| **Contract wallets** must implement `onERC1155Received` to claim | Fragments are ERC-1155 tokens |
| **Claiming a block that paid you nothing reverts** | Claim all skips such blocks automatically |
| **Rounding dust.** Each claim rounds down to a whole fragment; a block can pay up to about one fragment per rig less than its pool | Integer arithmetic. The dust is swept |
| **Overclocks bought in the final shift never expire**; they run to close | Their expiry shift is never reached. Harmless |
| **Difficulty is never adjusted.** A mis-sized season runs short or ends at the cap | Adjustable difficulty would let the operator pick winners |
| **No minimum pre-open.** A season may open the second it is created | Seasons are short. Parameters are published at creation and can be verified before staking |
| **Gas.** Activating a rig costs about 265k gas, claiming all blocks about 450k, and the bookkeeping call in the worst case about 960k | Fine on an Arbitrum-family chain; a keeper keeps the worst case from landing on a player |
| **The leaderboard comes from an indexer** and may lag by seconds | The mine page reads the chain directly |
| **The geo-fence is a front-end control** | The contracts are permissionless by design; eligibility is your responsibility under the terms |
| **Fragments are non-transferable** | Keeps them a receipt for a prize rather than a tradable instrument in this version |
