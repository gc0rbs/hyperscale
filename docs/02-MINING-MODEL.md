# Mining model – how "mining" works, and why it is not browser mining

## 1. The question

> Can this be browser mining? Or how does the mining work?

Short answer: **it should not be real browser mining, and it cannot be useful browser mining.**
Mining in Stock Miner is **virtual**: a rig's hashrate is a number stored on-chain, computed from
stake and upgrades, and each reward block streams a fixed pool of fragments to rigs in proportion to
hashrate over time. The browser renders the mine and shows a live estimate; it never computes anything
that affects rewards.

The rest of this doc explains the options considered and the reasoning, so the decision can be
revisited with the same facts.

## 2. What "browser mining" would actually mean here

Robinhood Chain is a rollup (Arbitrum Orbit). Blocks are produced by a sequencer and settled to Ethereum.
There is no proof-of-work anywhere in the stack, so a browser cannot "mine the chain". The only way to
put real hashing in the game is a **mineable-token pattern** (the ERC-918 / 0xBitcoin design):

1. The contract publishes a `challenge` and a `target`.
2. Players search for a `nonce` such that `keccak256(challenge, minerAddress, nonce) < target`
   (in WASM or WebGPU in the browser).
3. A solution is submitted as a transaction; the contract verifies the hash and pays the reward,
   then rotates the challenge and adjusts difficulty.

That is technically feasible on an EVM chain. The problems are not technical.

## 3. Options compared

| | A. Real browser PoW (ERC-918 style) | B. Virtual mining (stake-weighted emission) – **chosen** | C. Hybrid: B + bounded browser "boost" |
|---|---|---|---|
| Who wins | Whoever has the most compute. A single rented GPU box out-hashes thousands of phones. Bots need no browser at all. | Whoever stakes more and spends RIG smarter. Fully aligned with the "stake $RIG / burn $RIG" design. | Same as B, plus a small edge for players who show up. |
| Fits the spec ("stake to activate rigs, burn for upgrades") | No. Stake becomes a gate, not the driver; upgrades would have to scale real difficulty, which cannot be enforced client-side. | Yes, exactly. | Yes, if the boost is capped so it never dominates stake. |
| Fairness / sybil | Poor. Compute is cheap to rent and impossible to attribute to a person. | Good. Rewards are pro rata to capital at risk; sybil splitting gains nothing. | Boost must be small enough that botting it is not worth the effort, i.e. cosmetic-tier. |
| Cost to player | Battery, CPU, heat. Mobile browsers throttle background tabs; the game dies when the screen locks. | Gas for a handful of transactions. | Gas + optional light client work. |
| Platform risk | Chrome, Safari, ad-blockers and AV heuristics flag in-page hashing as **cryptojacking**. App-store review would reject a wrapper. | None. | Low if the work is tiny and opt-in. |
| Gas | One transaction per share found. To make solo browser mining viable the difficulty must be low, which floods the chain with tiny txs, or high, which means most players never find a share in 24h. | Constant-time accounting; a player needs ~3–10 txs per season. | Adds one tx per boost claim. |
| Energy / optics | Burns electricity to produce nothing (the hash secures nothing). Bad story for a Robinhood-adjacent product. | Zero. | Negligible. |
| Provable fairness | Yes, but only for the hashing; difficulty-adjustment and challenge selection have edge cases (front-running solutions in the mempool, solution stealing without commit-reveal). | Yes: every reward is a deterministic function of on-chain timestamps and state. | Yes, with commit-reveal on the boost. |

## 4. How virtual mining works (the chosen model)

Concepts, in order:

1. **Stake weight `W`** – set once at rig activation. `W = amount` for RIG; `W = amount × lpWeightPerToken`
   for LP tokens (LP gets a 25% bonus on its RIG-equivalent value; doc 04).
2. **Base hashrate** `H_base = W × gpuMult(gpuTier)`. GPU tiers are bought by burning RIG.
3. **Overclock hashrate** `H_oc = H_base × ocBoost × overclocksThisBlock`. Bought by burning RIG, expires at
   the block boundary, limited by heat (cooling tiers).
4. **Rig hashrate** `H = H_base + H_oc`. This is the number the UI animates.
5. **Emission**. Reward block *b* (6 hours) has a fragment supply `S_b`. It emits at a constant rate
   `r_b = S_b / 21600` fragments per second while `totalHash > 0`.
6. **Share**. Over any interval `[t1, t2]` in which nothing changes, rig *i* earns
   `r_b × (t2 − t1) × H_i / Σ_j H_j`. The contract implements this with the standard
   *accumulated-reward-per-unit-hash* pattern (MasterChef / Synthetix `StakingRewards`), extended with
   per-block snapshots so overclocks can expire at boundaries without a transaction. Doc 05 §4 has the
   exact math.
7. **Unlock**. When block *b* ends, its accumulated fragments become claimable. Claiming mints ERC-1155
   fragments whose id identifies the block's stock.
8. **Close**. After block 4 the mine is closed forever; only `withdraw`, `claim`, `redeem`, `cashOut` work.

A useful way to describe it to players: *"Your rig doesn't compute hashes; it holds a share of the
mine. The bigger your share, the bigger your slice of every second of emissions."*

### What the browser does

- Reads rig state and global state from the RPC.
- Computes the same accumulator formula locally at 60 fps to show fragments ticking up, and shows the
  difference between "estimated" and "claimable".
- Renders a hash-rate visualiser (a scrolling stream of pseudo-hashes generated from a seeded PRNG at a
  speed proportional to `H`). Purely cosmetic and explicitly labelled as such in the UI.
- Never sends anything except signed transactions.

## 5. Optional later: a bounded "browser boost" (option C)

If we want a *feeling* of active mining, v1.1 can add an opt-in mini-game that gives a small, capped
boost. Constraints that keep it honest:

- Boost ≤ 5% of `H_base`, so it never beats a single GPU tier and bots gain little.
- Work is a tiny client puzzle (e.g. find a nonce with 16 leading zero bits, ~50 ms on a phone) using a
  challenge derived from the rig id and the current hour, submitted via commit-reveal so solutions cannot
  be sniped.
- One boost claim per rig per hour, so a full season is ≤ 24 tiny transactions.
- Gas is the natural rate limiter; the boost value must stay above gas cost or nobody will use it.

This is deliberately out of v1 scope. It adds an oracle-free but bot-able mechanic, and the legal
review of "rewards for compute" is a separate question from "rewards for stake".

## 6. Decision

**Virtual mining (option B) for v1.** All player advantage comes from stake and RIG burned. The
browser is a viewer. Option C is a documented candidate for v1.1 once season 1 data shows whether
players want an "active" layer.
