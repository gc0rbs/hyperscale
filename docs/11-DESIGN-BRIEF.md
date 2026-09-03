# Design brief – visual direction, system, and motion

Companion to docs/06 (app spec) and docs/03 §8 (UX beats). Tokens live in `specs/design/tokens.css`
and `tokens.json`; the app imports them and never hard-codes a colour, font or radius. Mockups of the
key states live in `design/artboards/` and on the design canvas linked from `design/README.md`.

## 1. Direction: a clean fintech shell with an industrial mine inside

Two surfaces, deliberately different, sharing one accent pair and one type system.

| | Shell | Mine |
|---|---|---|
| Where | navigation, activate flow, claim, redeem, leaderboard, seasons | the `/mine` game view |
| Feel | calm, trustworthy, light. The stock-token prize has to feel legitimate. | dark, dense, mechanical. Coal-black panels, thin hairlines, amber energy. |
| Background | warm off-white `--shell-bg` | coal `--mine-bg`, panels one step lighter |
| Motion | almost none; state changes only | the only place the product moves: hash stream, progress bar, counters, heat |
| Type | IBM Plex Sans | Barlow Condensed for headings, IBM Plex Mono for every number |

The seam is intentional: leaving the mine for the claim page should feel like walking out of the pit
into the office.

Why not all-dark or all-playful: an all-dark terminal look reads as "for traders only" and makes the
redemption flow feel like a hack; an arcade look undermines the "real stocks" promise. Both are
sketched as alternates on the canvas so the choice is visible, not assumed.

## 2. Principles

1. **Progress, never clocks.** The mine's time is work. Every primary indicator is a progress bar with
   shift ticks. Wall-clock appears only as an "est." figure in a smaller, secondary style, and never
   as a countdown that implies certainty.
2. **Your number does not move when others act.** Fragments per second is the player's anchor stat.
   It is large, monospaced, and stable. The ETA is what moves, and it is visibly labelled as an
   estimate with a tooltip explaining why.
3. **Heat is a budget, not a warning.** The heat gauge is a fuel-style bar from amber to red with the
   next overclock's cost drawn as a ghost segment, so the player sees "room for two more" rather than
   "danger".
4. **Burn is visible, refunds are not implied.** Every purchase button shows the RIG burned in the
   label. Confirmation sheets repeat it with the phrase "burned permanently".
5. **One accent means one thing.** Ember (amber) is energy the player controls: hashrate, overclock,
   burn. Signal (cyan) is the mine's progress and what it gives back: ETA, block found, claimable.
   Red is reserved for the top of the heat gauge and for errors.
6. **Density follows pace.** Live density when the next shift is under ~2h away; long-haul density
   otherwise, which hides the hash stream, enlarges the ETA, promotes GPU/cooling over overclocks,
   and offers notifications. Same components, different arrangement.
7. **Cosmetic means labelled.** The hash stream carries a persistent, quiet caption: "Cosmetic. Your
   rewards depend on hashrate, not on this." No exceptions.
8. **Nothing on the mine page is rounder than 10px.** Rectangles, hairlines, chamfers. Pills belong
   to the shell only (wallet chip, filters).

## 3. Type

| Role | Face | Sizes | Notes |
|---|---|---|---|
| Display (mine headings, block names, the big ETA) | Barlow Condensed 600/700, uppercase, tracking +0.02em | 32 / 48 / 72 | Fallback Arial Narrow |
| UI | IBM Plex Sans 400/500/600 | 13 / 15 / 18 | Fallback Helvetica |
| Data (every number, address, hash) | IBM Plex Mono 400/500, tabular figures | 12 / 13 / 15 / 22 / 32 | Never proportional digits for anything that ticks |

## 4. Colour

Tokens in `specs/design/tokens.css`. Contrast: all text ≥ 4.5:1 on its surface; muted text on the
mine panels is `--mine-muted` (#9A948A on #1F1C18 = 6.2:1). Ember on coal is 9.3:1; signal on coal
is 10.1:1; both pass as text. Never put ember text on signal fills or vice versa.

Stock identity: each block's stock gets no colour of its own. It gets a ticker in display type and a
position (1–4). Colour is reserved for meaning, not for branding four tickers.

## 5. Components

| Component | Surface | Anatomy |
|---|---|---|
| Block card | mine | ticker + block n/4 · pool (tokens, ≈ USD) · progress bar with 8 shift ticks and a moving head · three est. figures (next shift, block found, close) · total hash · your share |
| Rig card | mine | id + asset chip · hashrate (mono, large) · fragments/s · earned this block · GPU tier pips (5) · cooling pips (3) · heat gauge with ghost segment · active overclocks (3 slots, each with remaining-shift bar) · actions row: Overclock, GPU, Cooling, each with burn amount |
| Hash stream | mine | 12-line scrolling column of pseudo-hashes, speed ∝ hashrate, capped, caption |
| Position summary | mine | your hash · your share ring · fragments/s · est. close · Exit rig link |
| Claimable list | mine/shell | block ticker · fragments · token equivalent · Claim button; found blocks only |
| Found banner | mine | full-width signal bar: "Block 2 found · TSLAx" · your fragments · Claim · dismiss; shift ticks flash once |
| Purchase sheet | both | what you get (Δ hashrate, fragments/s, mine coverage %) · what it costs (RIG burned, permanently) · break-even hint (labelled estimate) · confirm |
| Eligibility card | shell | wallet · in-kind eligible yes/no with reason · what you can do |
| Phase banner | shell | pre-open countdown / mine open / mine sealed (permanent) / redemption window |

## 6. Motion

| Element | Behaviour | Reduced motion |
|---|---|---|
| Hash stream | translateY loop; 1 line per `(1 / (H/1e24))` seconds, clamped 0.15–1.2s; fades at top and bottom | static, no scroll |
| Progress head | moves on each poll with `--dur-slow` ease-out; never interpolates across a shift boundary | jumps |
| Fragment counter | ticks every animation frame from the last two polls' interpolation; digit roll not used (too playful) | updates per poll |
| Shift end | tick mark fills, heat gauge drops with `--dur-slow`, expiring overclock slots dim | same, instant |
| Block found | signal banner slides down 200ms, progress bar fills to 100% then resets to 0 for the next block; no confetti particles, one bar sweep | banner appears |
| Overclock purchase | slot fills ember, hashrate number re-rolls once, heat ghost becomes solid | instant |
| Close | mine panels desaturate to `--mine-dim` over 400ms, "Mine sealed" stamp | instant |

## 7. States covered by the mockups

Desktop 1440×900 unless noted. All on the design canvas.

1. **Live mining** (`Main`) – block 2 of 4, two rigs, one claimable block, live density.
2. **Long haul** – same season at 1/16th the hashrate: ETA in days, calm layout, notifications.
3. **Block found** – the banner over the live view.
4. **Pre-open** – countdown to open, TVL and estimated length if opened now, rig ready, GPU shop.
5. **Closed** – mine sealed, withdraw, claim block 4, redemption window.
6. **Redeem** – shell page: eligibility, balances per stock, redeem in kind vs cash out.
7. **Mobile live mining** (390×844).

Not mocked (build from the components above): activate flow, leaderboard, seasons, purchase sheet
internals, error states. Phase 3 should mock the purchase sheet first, it carries the burn promise.

## 8. Alternate directions (rejected, kept for the record)

- **All-dark terminal**: everything on coal, mono everywhere, denser. Sharper for traders, hostile
  for everyone else, and the redeem flow loses its "this is a real asset" register.
- **Bright arcade**: saturated colour blocks, chunky type, playful. Better first-minute delight,
  worse trust for a product paying out in equities, and colour-as-decoration collides with
  colour-as-meaning.

Low-fi sketches of both sit on the second page of the canvas.
