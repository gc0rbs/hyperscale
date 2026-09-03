# Moodboard

Eight images generated with Higgsfield (Recraft V4.1, standard, palette-constrained to the tokens in
`specs/design/tokens.css`) to set the tone for the direction in `docs/11-DESIGN-BRIEF.md`. They are
references, not assets: nothing here ships in the app.

| # | File | What it sets | Feeds |
|---|---|---|---|
| 1 | `01-rig-hall.webp` | The mine at scale: coal-black racks, rows of amber pinpoints, one cyan strip at the vanishing point, haze. | `--mine-bg`, `--ember` as pinpoints not floods, `--signal` as the far goal |
| 2 | `02-tick-marks.webp` | Hairline etched ticks on dark brushed metal with a single amber source. The progress bar's texture. | Block card progress bar; hairline borders `--mine-line` |
| 3 | `03-heat.webp` | Amber running to red at the tip. Heat is energy, red only at the limit. | Heat gauge gradient `--ember` → `--heat-hot` |
| 4 | `04-typography.webp` | Condensed stencil uppercase over a hot painted stripe, small light numerals below. | Barlow Condensed display, IBM Plex Mono data, uppercase labels |
| 5 | `05-shell-still-life.webp` | Warm off-white, paper, one black instrument, one amber object. The shell's calm. | `--shell-bg`, `--shell-fg`, ember as a single accent object |
| 6 | `06-ore-vein.webp` | The vein: dark rock, a seam of amber, cyan daylight at the exit. Mining as a journey toward the signal. | Block-found and close moments; hash stream "hits" in ember |
| 7 | `07-signal-gauge.webp` | One long cyan bar on a dark panel with fine ticks and a white needle. The ETA, not a clock. | Progress head (white), shift ticks, `--signal` fill |
| 8 | `08-the-seam.webp` | A bright minimal lobby opening straight into a dark machine hall with one cyan line. The shell-to-mine threshold, literally. | The nav-to-mine seam; why the two surfaces coexist |

Generated 2026-09-03. Job ids and raw 1280×832 PNGs are on the Higgsfield account; the repo keeps
the web-size versions only. Regenerate with different prompts by editing `design/build-artboards.py`
captions and re-running the generation, or ask the session that made them.
