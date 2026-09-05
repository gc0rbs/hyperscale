# Claiming fragments

A block becomes claimable the instant it is found. Fragments you earned in a found block are yours on chain already; claiming mints them to your wallet as ERC-1155 tokens (one token id per block).

## How

Open **Claim**. Each rig lists its found blocks and the fragments earned in each. **Claim all** mints every found block for a rig in one transaction. You can also claim a single block.

## When

Whenever you like. Fragments never expire inside the mine. Two things do have deadlines:

* **Redemption** is only open for 30 days after close. Unclaimed fragments cannot be redeemed after the window, and the vault's remaining assets are swept to the treasury.
* **Cancellation** forfeits unclaimed fragments. If a season is cancelled after an over-long pause, fragments you had not yet claimed are lost. Claiming as blocks are found is the safest habit. See [Pause and cancellation](../safety/pause-and-cancellation.md).

## The hard limit

The contract will never mint more fragments for a block than that block's pool holds: `minted fragments ≤ pool tokens × 1,000,000` is enforced inside every claim. This is the invariant that keeps the vault solvent for every redeemer.

## Details

* A claim for a block that paid the rig nothing reverts with `AlreadyClaimed`. **Claim all** skips such blocks automatically.
* Each claim rounds down to a whole fragment. The dust, at most about one fragment per rig per block, is swept at the end of the season.
* Fragments are non-transferable. You cannot send them to another wallet or sell them; you redeem them.
* A smart-contract wallet must implement `onERC1155Received` to claim.
