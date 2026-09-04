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
