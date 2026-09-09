# Rebrand concept – from "Stock Miner" to an AI-compute game

| Field | Value |
|---|---|
| Status | **Adopted 2026-09-06** as Hyperscale / $RIG; **revised 2026-09-09**: name = **Hyperscaler**, token = **$VRAM** (a new Pons launch), green palette and logo from the client's design handoff (docs/DECISIONS.md 2026-09-09). Repo stays `gc0rbs/hyperscale`. §9 items 1–2 are decided. |
| Scope | Same contracts, same math, same params. New fiction, names, copy and art. |
| Companion | 02 (mining model), 03 (game design), 11 (design brief) |

## 1. The pitch in one paragraph

Players are **GPU operators**. They stake the game token to bring a **node** online, burn it on
better silicon, cooling and clock boosts, and their node's **throughput** serves a queue of four
**inference jobs**. Each job is a fixed amount of compute that pays a fixed rate per unit served, so it
**completes** exactly when its budget is spent, and the payout is fractional shares of the companies
that actually sell the compute: **NVDA, MU, SNDK, QQQ**. More operators do not dilute anyone; they
finish the queue faster. When job 4 completes the cluster is **decommissioned** and operators cash
out. Nothing on the chain changes: this is `SeasonMine` with a different story on top.

Why the fit is better than the crypto-mining story:

- **The prize is the fiction.** NVDA (GPU), MU (HBM memory), SNDK (flash storage), QQQ (the index that
  owns the datacenters) is literally the AI supply chain. "Run compute, earn the compute stack" is one
  sentence. "Mine hashes, earn a memory stock" needed a diagram.
- **Virtual work reads as honest.** Nobody expects a browser to hash, but everybody knows a GPU
  serves tokens at a rate. "Throughput × seconds = compute served" is the mental model every ML person
  already has (FLOPS × s = FLOPs). Doc 02's whole "why not browser mining" defence becomes a footnote.
- **The upgrade tree is already a datacenter.** GPU tiers, cooling tiers, overclocks and heat were
  borrowed from mining rigs; they are more literal in a server hall than in a coal mine.
- **Progress-not-time survives intact.** "The job finishes when the compute is done" is how batch
  inference and training runs actually work. Nobody needs the difficulty metaphor explained.
- **Robinhood audience.** The AI trade is the retail narrative of the moment. The game lets someone
  who cannot afford a whole NVDA share earn a fraction of one by playing the AI trade as a game.

## 2. Name

| Candidate | For | Against |
|---|---|---|
| **Hyperscale** (recommended) | One word, the industry term for what the players are pretending to be, verb-able ("go hyperscale"), works as a wordmark in Humane, `.gg`/`.xyz` likely available | Slightly abstract for a first-time visitor; needs the tagline to say "stocks" |
| **Inference Farm** | Says exactly what you do, "farm" bridges from yield-farming vocabulary the crypto crowd knows | Two words, less brandable, "farm" may read as passive yield |
| **Compute Cluster** / **The Cluster** | Neutral, literal, the season object is literally a cluster | Generic, hard to own, sounds like infra not a game |

Tagline under any of them: **"Run the compute. Own the chips."** Alternate: **"Serve four jobs. Earn
the AI stack. Then the cluster shuts down forever."**

Token: **$VRAM** (recommended). It is the scarce resource of the AI build-out, it ties to MU in the
prize set, it is one syllable people already say, and "burn VRAM" sounds like a thing. Alternates:
$FLOP (funny, but "flop" is a bad word to put on a chart), $TFLOP, $WATT (power, works with heat and
cooling; second choice), $INFER. Avoid $CUDA, $HOPPER, $BLACKWELL: NVIDIA trademarks.

The Pons launch and the fixed 1B supply are unchanged; only the symbol and name differ. If the
token is already deployed as RIG, the rebrand still works: RIG is a perfectly good datacenter word
too ("rig" is used for GPU rigs), and only the story copy needs to move.

## 3. Term map

Left column is what the contracts and docs 01–05 say. Right column is what players see. Contract
identifiers do not change (§8).

| Current | Rebrand | Notes |
|---|---|---|
| Stock Miner | Hyperscale | |
| $RIG | $VRAM | |
| Season / mine | **Cluster** (a season is "Cluster 1", "Cluster 2") | "the cluster" is the `SeasonMine` instance |
| Rig | **Node** | A wallet with several nodes runs a "fleet" |
| Activate a rig | **Bring a node online** / provision | |
| Stake weight `W` | **Capacity** | still $VRAM-equivalent, immutable |
| Hashrate `H` | **Throughput**, unit TFLOPS | the animated number |
| Work (hash-seconds) | **Compute served**, unit TFLOP (TFLOPS × s) | dimensionally exact; the UI picks G/T/P prefixes |
| Total hash | **Cluster throughput** | |
| Reward block | **Job** (Job 1/4 … Job 4/4) | alt: "workload" |
| Difficulty `D_b` | **Job size** in compute | fixed at creation, never adjusted |
| Pay rate `r_b` | **Rate** in shards per TFLOP | "your rate does not change when others join" |
| Block found | **Job complete** | |
| Shift | **Epoch** (8 per job, 32 per cluster) | overclocks expire and heat decays at epoch ends |
| Shift ticks (tick bar) | **Epoch ticks** | the signature 8-tick bar stays |
| GPU tier 0–5 | **GPU generation** Gen 0–5 | see §4 for names |
| Cooling tier 0–3 | **Cooling** Air / Liquid / Direct-to-chip / Immersion | |
| Overclock | **Boost clock** (or keep Overclock) | "+50% throughput until the end of the next epoch" |
| Heat 0–100 | **Thermal load** 0–100% | fuel-style gauge stays |
| Fragment | **Shard** | 1,000,000 shards = 1 Stock Token; ML people know "model shards" |
| Stock Token fragments of NVDA | **NVDA shards** | |
| Claim | **Collect** (or keep Claim) | |
| Exit (early, 3%) | **Decommission node** | deposit back minus 3%, shards kept |
| Close (block 4 found) | **Cluster shut down** / "decommissioned forever" | |
| Cap `maxDuration` | **Contract deadline** | "the compute contract ends at T even if the queue is not finished; what was served is paid, the rest rolls to the next cluster" |
| Redemption / cash out | **Payout**: in kind (stock tokens) or cash | |
| Hash stream (cosmetic) | **Token stream** (cosmetic) | see §5 |
| Planned pace | **Sized for** ("sized for ~3h at 10 PFLOPS") | |
| Poke | unchanged, ops only | |
| Sweep | unchanged, ops only | |
| ETA | **ETA** | still labelled estimate |

Formulas in the new vocabulary (numbers identical to doc 03 §3–4):

```
gen(g)          = 1 + 0.20 × g                    Gen 0..5  → 1.0x … 2.0x
throughput_base = capacity × gen(gen)
throughput_boost= throughput_base × 0.50 × activeBoosts     0..3
throughput      = base + boost                    max 5.0 × capacity
served(node,dt) = throughput × dt                 TFLOP
rate_j          = shards_j / jobSize_j            shards per TFLOP, fixed per job
earned(node,dt) = throughput × dt × rate_j        independent of every other node
job j completes when Σ served in job j == jobSize_j; then Σ earned == shards_j
```

## 4. The upgrade tree, renamed

**GPU generation** (permanent multiplier, burn $VRAM, best bought before the cluster opens). Names
are invented so no NVIDIA trademark appears in the product. Each is a plausible class of part, and
the flavour text is one line in the purchase sheet.

| Gen | Mult | Cost of capacity | Name | Flavour |
|---|---|---|---|---|
| 0 | 1.0x | – | Consumer card | "It runs. Barely." |
| 1 | 1.2x | 4% | Datacenter card | Passive-cooled, PCIe |
| 2 | 1.4x | 6% | Tensor card | Dedicated matrix units |
| 3 | 1.6x | 9% | HBM module | Memory-bound no more |
| 4 | 1.8x | 13% | Superchip | CPU+GPU on one package |
| 5 | 2.0x | 18% | Rack-scale | 72 GPUs, one NVLink domain |

**Cooling** (enables sustained boosting, burn $VRAM, for operators who intend to run every epoch).

| Tier | Heat per boost | Heat removed per epoch | Cost | Name |
|---|---|---|---|---|
| 0 | 40 | 10 | – | Air |
| 1 | 30 | 18 | 3% | Liquid loop |
| 2 | 22 | 26 | 5% | Direct-to-chip |
| 3 | 15 | 36 | 8% | Immersion |

**Boost clock** (pay-as-you-go burst): 2% of capacity, +50% base throughput per active boost, up to 3,
expires at the end of the next epoch, adds thermal load, refused when the node would exceed 100%.

The tradeoff triangle keeps its shape: generation = buy early, cooling = commit to the whole cluster,
boost = late burst when nothing else has enough queue left to pay off. The purchase sheet keeps the
"covers X% of the cluster" line and the break-even hint.

## 5. Visual and motion translation (doc 11 deltas)

The two-surface structure, type system, colour meanings and the "nothing rounder than 10px" rule all
stand. What changes is the set dressing.

- **World.** Mineral black stays; the mine becomes a **server hall**. Panels are rack faces: thin
  hairlines, status LEDs, cable-tray verticals. Ember (amber) stays "energy the operator controls"
  (throughput, boost, burn) and reads as GPU die glow. Signal (cyan) stays "what the cluster gives
  back" (progress, job complete, collectable) and reads as NVLink/coolant.
- **Rig room → rack view.** The isometric rig room becomes a rack elevation: each node is a
  server sled whose GPU die glows brighter per active boost and whose front LED goes red near
  thermal max. Same data-driven SVG approach as before.
- **Hash stream → token stream.** The cosmetic scrolling column becomes streaming generated text or
  log lines (`step 4021  tok/s 118k  loss 1.83`) from a seeded PRNG at a speed proportional to
  throughput. The caption is mandatory and unchanged in intent: "Cosmetic. Your payout depends on
  throughput, not on this."
- **Gem → wafer.** The reward object at job complete becomes a faceted **silicon die** with a cyan
  edge; loose **shards** are chiplets; shards streaming into a cyan-rimmed coin still explains payout.
- **Tick bar.** Unchanged. Eight ticks, cyan fill, white head; now labelled epochs. It remains the
  brand device on share cards, posters and apparel.
- **Logo.** The pick-and-hammer mark becomes a **GPU die outline with one ember corner** in the same
  ember square. The wordmark stays Humane 700 uppercase.
- **Icons.** Six glyphs re-drawn: node (server sled), boost (clock/lightning), cooling (droplet in a
  chip), shard (chiplet), thermal (gauge), lock (unchanged).
- **Heat gauge → thermal gauge.** Identical component, relabelled, with the ghost segment for the
  next boost.
- **Job card = block card.** Ticker + Job n/4, pool (tokens, ≈ USD), progress bar with 8 epoch ticks,
  est. next epoch / job complete / shutdown, cluster throughput, your share.

## 6. Copy samples

Landing hero
> **HYPERSCALE**
> Run the compute. Own the chips.
> Stake $VRAM to bring a node online. Serve four inference jobs. Get paid in NVDA, MU, SNDK and QQQ.
> When the fourth job completes, the cluster shuts down forever.

How it works (three cards)
1. **Bring a node online.** Stake $VRAM. Your capacity is fixed; open another node to add more.
2. **Serve compute.** Every second, your node serves throughput × 1s of compute to the current job.
   Your rate per TFLOP never changes when someone else joins. They just finish the queue faster.
3. **Get paid in the AI stack.** Each completed job pays shards of a real stock token. A million shards
   is one share. Collect any time, cash out or take the token after shutdown.

Job complete banner
> Job 2 complete · MU · you served 12.4 PFLOP · 2,564,102 shards · Collect

Share text (replaces `FoundBanner.tsx` string)
> Job 2 complete on Hyperscale: my node earned 2.564 MU on Robinhood Chain.

Purchase sheet, GPU Gen 3
> HBM module · 1.6x throughput · covers 74% of the remaining cluster · burns 9,000 $VRAM permanently ·
> break-even ≈ 3,100 NVDA shards at today's rate (estimate)

Decommission confirm
> Decommission node #14? Your deposit returns minus 3%. Shards you earned stay collectable. Your GPU
> generation and cooling are lost with the node.

Contract deadline (slow cluster)
> On current throughput the contract deadline lands after Job 2. Jobs 1–2 are paid in full; the rest of
> the pool rolls into the next cluster.

Social voice (LAUNCH-SOCIAL-GUIDE rewrite hooks): "The AI trade, as a game." / "You cannot buy 0.3
NVDA on Robinhood. You can earn it here." / "Nothing is on a clock. The job is done when the compute
is done." / "More operators do not dilute you. They just finish faster." / "Job 4 is the richest. 40%
of the pool for 30% of the compute. That is when everyone boosts."

## 7. Season 1 in the new fiction

Job order is unchanged from `season-default.json` and now tells a story: the queue works up the stack.

| Job | Stock | Pool value | Compute share | Story |
|---|---|---|---|---|
| 1 | NVDA | 15% | 20% | the accelerator |
| 2 | MU | 20% | 25% | the memory bound |
| 3 | SNDK | 25% | 25% | the storage tier |
| 4 | QQQ | 40% | 30% | the whole datacenter |

"Sized for ~3h at 10 PFLOPS, deadline 6h" replaces "sized for ~3h at 10M hash, cap 6h". The
`expectedTotalHash` of 10,000,000 displays as 10 PFLOPS by treating one on-chain hash unit as one
GFLOPS; that is a display constant in the app, not a contract change.

## 8. What changes technically, and what must not

**Unchanged, deliberately.** Every Solidity identifier, event, interface in `specs/contracts/`, the
param schema, the accounting in doc 05 and the audit package. `SeasonMine`, `StockFragments`,
`RedemptionVault`, `activate`, `overclock`, `buyGpu`, `buyCooling`, `poke`, `claim` all keep their
names. Renaming audited code for a story is pure risk, and the hard rules in CLAUDE.md (immutable
season, no time-based reward, 100% burn, fragment cap) are the same rules under either fiction.

**Changes (all off-chain or cosmetic).**

| Area | Change | Size |
|---|---|---|
| Token | Symbol and name at Pons launch, `contracts/src/tokens/RIG.sol` dev token name/symbol strings only | trivial |
| `app/` | Every user-facing string per the §3 map; unit formatting (TFLOPS/TFLOP prefixes); `opengraph-image`, `twitter-image`, `metadata` titles; share text | ~1–2 days |
| `app/` visuals | Logo mark, six icons, token stream generator, rack view, wafer reward object, thermal gauge label | design-led, ~1 week with the canvas |
| `docs/` | GLOSSARY gains a "player term" column; 01/02/03/11 get a one-line banner pointing here; LAUNCH-SOCIAL-GUIDE rewritten in the new voice | ~1 day |
| `specs/params` | `name` and `notes` strings; optional display constant for the FLOPS unit | trivial |
| `ops/` | Nothing. Scripts talk to contracts. | none |
| `indexer/` | Nothing on-chain; optional display names in the API layer | none |

The app already mirrors contract math client-side (doc 02 §4 "what the browser does"), so the unit
relabel is a formatting layer, not a second model.

## 9. Decisions needed (recommended default first)

1. **Name.** Hyperscale / Inference Farm / Compute Cluster. Default: Hyperscale, pending a domain and
   handle check.
2. **Token symbol.** $VRAM / $WATT / keep $RIG. Default: $VRAM if the Pons launch has not happened;
   keep $RIG if it has and rebrand copy only.
3. **Boost vs Overclock.** "Overclock" is the more authentic GPU word and matches the contract
   function. Default: keep Overclock; use "boost" only as the verb in flavour copy.
4. **Claim vs Collect.** Default: keep Claim (matches the contract, matches wallets).
5. **GPU generation names.** Fictional classes (§4) vs plain "Gen 1–5". Default: fictional names in
   the purchase sheet, "Gen n" pips on the node card.
6. **Job order framing.** The stack story in §7 depends on the NVDA→MU→SNDK→QQQ order, already
   decided 2026-09-04. No change.
7. **Compliance copy.** Doc 07 language about "no reward depends on player compute" must stay true and
   visible: the token stream caption and a how-it-works line saying "your device does no computation;
   throughput is a number derived from your stake and upgrades". Default: keep doc 02 §3's option B
   defence in the FAQ, reworded for the new fiction.

If 1–2 are decided, the rest can ship as one app PR plus one docs PR with no contract redeploy.
