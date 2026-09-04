# Logo mark ideas – round 1

Twenty marks generated 2026-09-04 with Higgsfield (Recraft V4.1, `vector` mode, palette constrained to
`specs/design/tokens.css`: ember #F2A93B, signal #45C4DB, off-white #EDE9E1, coal #171512). Each file is
the raw SVG from the model at 1024px. `00-contact-sheet.png` shows all twenty on coal.

They are ideas to react to, not assets. The current mark (crossed pick and hammer in an ember square,
`LogoMark` in `app/src/components/Icons.tsx`) is 01 here, regenerated as a control.

Brief constraints applied: one accent means one thing (ember = player energy, signal = the mine's
progress and what it gives back); nothing rounder than 10px in the mine, so chamfers not rounds;
the tick bar and the gem are the two brand objects the direction already approved.

| # | Concept | What it draws on | Read |
|---|---|---|---|
| 01 | Crossed pick and hammer in a chamfered ember square | Current mark, control | Reads instantly as "mining", but generic. Chamfer is better than the current square corners. |
| 02 | Bolt-handled pickaxe with a cyan spark | The 01-logo-sheet bolt-and-pickaxe | Most energetic single shape. The bolt says "hashrate". Needs a cleaner joint between bolt and head. |
| 03 | Eight-tick progress bar in a chamfered frame | The tick bar as signature device | The most ownable: nobody else's mining logo is a progress bar. Weak at 16px unless the ticks get fatter. |
| 04 | Faceted amber gem, cyan top edge | The reward gem | Clean and premium. Reads as "gem app", not "mining"; better as the reward icon than the brand. |
| 05 | Four blocks, fourth filled cyan | Four reward blocks, mine closes on the fourth | Abstract and quiet. Tells the story only once you know it. The model rendered three off-white, not outlined. |
| 06 | Pickaxe striking a block, cyan shards | Block found moment | Narrative, a bit illustrative for a mark. Good for the empty-state or notification icon. |
| 07 | Shards converging into a cyan-rimmed coin | Fragments to token explainer | The model made a pie, not converging shards. Concept still worth a hand-drawn pass. |
| 08 | Isometric rig tower with slots and fins | Rig tiers art | Too detailed for a mark, right for the rig-room. |
| 09 | Mine portal with amber interior, cyan ground line | Mine entrance | Simple, strong silhouette, distinct from crypto-mining clichés. Reads as a hut at small sizes. |
| 10 | SM monogram, condensed, cyan tick | Humane display type | Closest to the wordmark voice. The negative-space pickaxe did not land; the cyan tick on the M is nice. |
| 11 | Segmented hexagon gauge with pickaxe centre | Progress ring + pick | Too busy, reads as a crypto badge. |
| 12 | Hash symbol with chamfered bar ends | Hash-work is the game's clock | Bold and ownable; the # is a literal claim about the mechanic. Watch the resemblance to generic # logos. |
| 13 | Strata hairlines with an amber vein and cyan gem | Seam / vein art | Beautiful at large sizes, dies below 48px. Poster device, not a mark. |
| 14 | Single amber shard with cyan spine in an off-white frame | Fragment | Clean, minimal, would work as the fragment glyph and as an app icon. |
| 15 | Downward drill bit, cyan tip | Drilling | Reads as a screw. Drop. |
| 16 | Cyan candlesticks, tallest becomes a pickaxe | Stocks + mining in one object | The clearest "stock miner" pun. The pickaxe bar is oddly wide; worth a redraw. |
| 17 | Chart line as a tunnel through a block, cyan arrowhead | Up-only meets a mine | Generic fintech arrow. Drop. |
| 18 | Coin split ember / signal with a pickaxe stamped | Token + tool | Strong at small sizes, but the two halves break "one accent, one meaning". |
| 19 | Isometric block with a tick bar on its face | Block + tick bar | Two approved devices in one object. Ticks vanish at icon size; simplify to four. |
| 20 | Sealed-mine stamp: frame, cyan bar, pickaxe | "Closes forever" | Reads as a package or a gift box. Drop. |

## Shortlist for a drawing pass

1. **03 tick bar** – the brand's own device, no other mining product owns it.
2. **02 bolt pickaxe** – energy in one stroke; pairs with the wordmark.
3. **16 candlestick pickaxe** – the literal name, in one glyph.
4. **12 hash mark** – the mechanic (work, not time) as a symbol.
5. **14 shard** – fallback: minimal, works from favicon to billboard.

Next: redraw the shortlisted five by hand in the icon grid used by `Icons.tsx` (32 viewBox, 3px stroke),
test at 16 / 24 / 48 / 256px on coal and on `--shell-bg`, then pick one and log the decision in
`docs/DECISIONS.md`.

## Round 2 – pickaxe only, gem only (21–40)

Same model and palette, 2026-09-04. Ten pickaxe variations, ten gem variations. Contact sheet:
`00-contact-sheet-round2.png`.

### Pickaxe

| # | Concept | Read |
|---|---|---|
| 21 | Blade only, no handle, cyan hairline on top | Reads as a mushroom or a sombrero. The handle is what makes a pickaxe legible. Drop. |
| 22 | Single continuous stroke | Wandering, weak. Drop. |
| 23 | Pickaxe knocked out of a solid cyan chamfered square | Best app-icon candidate of both rounds: one shape, one accent, bold at 16px. Cyan is the wrong accent for the tool (ember = player energy); swap to a solid ember tile with a coal pickaxe. |
| 24 | Top-down T with cyan tick at the base | Clean, symmetric, reads as a pickaxe from any distance. The blade split into amber and off-white halves by accident; keep that, it gives it a lit edge. Shortlist. |
| 25 | Two crossed pickaxes, cyan diamond at the joint | Heraldic, well drawn, a bit "mining guild". Works as a badge. |
| 26 | Handle as an eight-tick progress bar | Both brand devices in one object and it still reads as a pickaxe. Ticks will need to drop to four at small sizes. Shortlist. |
| 27 | 45-degree blocky pickaxe | Read as a bow and arrow. Drop. |
| 28 | Blade curving into a rising chart arrow | Too fussy, reads as a swoosh. Drop. |
| 29 | Faceted low-poly pickaxe | Interesting: the tool made of the material it mines. Too many facets for a mark; a three-facet redraw could work. |
| 30 | Tiny pickaxe in a notched cyan ring | Pickaxe too small; the ring dominates. Drop. |

### Gem

| # | Concept | Read |
|---|---|---|
| 31 | Outline brilliant cut, cyan dot at the tip | Elegant, classic jewellery mark, not a mining product. Keep as a reward-state illustration style. |
| 32 | Top-down hexagonal gem, cyan centre | Reads as a radiation or nuclear symbol. Drop. |
| 33 | Gem split into four shards, cyan gaps | The strongest gem: four blocks, one token, and the split reads at any size. The kite proportion needs squaring up. Shortlist. |
| 34 | Gem half buried in a block, cyan ground line | Tells the story of "mining a stock" in one glyph. Too illustrative for a nav mark; good for the block card. |
| 35 | Two-facet favicon gem, cyan top | Simplest gem here; reads as a crown or a wizard hat. Drop. |
| 36 | Gem in a chamfered cyan frame | The gem came out as a compass rose. Drop. |
| 37 | Crystal point crossed by a tick bar | Fights itself: two devices, neither wins. Drop. |
| 38 | Isometric chamfered cube with faceted top | Convincing 3D gem block; ties to the rig-room isometric style. Heavy for a mark. |
| 39 | Gem melting into a pick point | Reads as a tooth or a drop. Drop. |
| 40 | Gem cut out of a solid ember square | Bold, one shape, works as an app icon. The cut-out shape is a bit lopsided; a symmetric redraw would fix it. Shortlist. |

## Shortlist after two rounds

Pickaxe: **24** (top-down T), **26** (tick-bar handle), **23** (knock-out tile, recoloured ember).
Gem: **33** (four-shard gem), **40** (gem knock-out tile).
From round 1 still standing: **03** (tick bar), **16** (candlestick pickaxe).

Recommended pair for the drawing pass: **24 + 33**. The pickaxe is the brand mark (what the player does),
the four-shard gem is the reward object the brief already approved. 23 and 40 are the same idea in
two materials, so the app icon can be whichever of the two the mark becomes.
