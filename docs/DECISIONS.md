# Decisions

Dated log of decisions that change the spec, the design, or the build. Newest first.

## 2026-09-03 – Visual direction locked

**Decision.** Ship the direction shown in `design/launch/` (the reference-driven set), which resolves as:

- Coal-dark mine surfaces with flat, hairline-bordered cards; light shell for navigation, redeem and
  leaderboard (unchanged from the brief).
- The **cyan tick bar** is the signature device on every surface, from progress bars to apparel.
- **Fragments / the gem** are the reward language: a faceted amber gem with a cyan edge for block
  found, shards for fragments, shards-to-coin for redemption.
- The **rig room** (isometric rigs that visibly overclock) is the mine dashboard's left pane,
  with the block, rig and claim cards on the right. The flat dashboard mockup on canvas page 1 is
  the fallback if the rig room proves too expensive in Phase 3.
- Barlow Condensed 600 (500 at 48px+), IBM Plex Sans, IBM Plex Mono.

**Not taken.** The seam (direction A) and the material treatment (direction B) from
`design/directions/`. The seam stays documented as an optional later flourish; material is for
physical goods only.

**Why.** The user reviewed all five canvas pages and picked the sixteen references that became the
launch set, then approved it. Fragments and the rig room explain the product faster than the seam
did, and the reference-driven set produced layouts close enough to build from.

**Consequences.** Brief §1 and §5 updated; Phase 3 prompt points at `design/launch/` first; the
fixes listed in `design/launch/README.md` are Phase 3 tasks.
