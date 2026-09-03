# Build plan and session prompts

How to turn the spec set into a working v1 using Claude Code sessions, and the prompt for each phase.

## 1. How the build is organised

Five phases. Each is one or more Claude Code sessions with a self-contained prompt below. Phases 1
and 2 have no dependency on each other and should run in parallel sessions (or worktrees). Phase 3
needs phase 1's ABI; phase 4 needs everything.

```
Phase 0  Scaffold + CI + CLAUDE.md wiring                     ~1 session
Phase 1  Contracts: core + tests + gas                        ~3–5 sessions   ┐ parallel
Phase 2  Economic simulation + parameter/difficulty tuning    ~2 sessions     ┘
Phase 3  App + indexer + keeper against Anvil                 ~4–6 sessions
Phase 4  Hardening: security review, audit prep, deploy, testnet dry run   ~2–3 sessions
```

Every session: designated branch, commit small, `docs/BUILD-LOG.md` entry at start and end. `CLAUDE.md`
carries the standing rules so prompts stay short.

## 2. How the prompts are written (and why)

These prompts are tuned for a strong agentic model. The principles, so you can adapt them:

- **Point at the spec, do not paste it.** The docs are in the repo; the model reads them. Pasting
  invites drift between two copies.
- **State done, not steps.** Give the exit criteria (tests, invariants, gas, coverage) and the
  constraints, then let the model plan its own sequence. Micromanaged step lists make a strong model
  worse, not better.
- **Demand tests that would catch the bugs that matter.** Name the invariants and scenarios that are
  non-negotiable. The model will add more.
- **Make it plan and self-review.** Ask for a written plan first and an adversarial re-read at the end.
  Both measurably improve output on multi-hour tasks.
- **Grant permission to fix the spec.** A model that treats the spec as gospel will implement known
  flaws. Require that spec and code change together, logged in `docs/DECISIONS.md`.
- **Keep the "never" list short and absolute.** It is in `CLAUDE.md`; prompts refer to it.
- **Say what is out of scope.** v1.1 items are tempting to build.
- **Parallelise across packages, not within one.** Contracts and sim in separate sessions; inside the
  contracts package, one session at a time (shared state).
- **Ask for a report the next session can start from.** The `BUILD-LOG.md` entry is the hand-off.

Optional: this harness supports multi-agent workflows. Saying "use a workflow" in a prompt lets the
session fan out independent sub-tasks (e.g. writing scenario tests for each of the eight scenario
families in parallel, then verifying). Useful in phases 1 and 4; not needed for phase 0.

## 3. Phase prompts

Copy one prompt per session. Replace `<branch>` with the branch for that session.

---

### Phase 0 – Scaffold

```
You are starting the Stock Miner build. Read CLAUDE.md, docs/08-DELIVERY-PLAN.md and
docs/06-TECH-SPEC-APP.md §1 first.

Goal: a monorepo skeleton where every package's check command runs green in CI and in a fresh
Claude Code remote session, so later phases can start coding immediately.

Deliver:
- pnpm workspace root with packages contracts/ (Foundry), app/ (Next.js App Router + TypeScript +
  wagmi/viem + Tailwind), indexer/ (Ponder), ops/ (TypeScript scripts), sim/ (Python 3.11, uv,
  pytest). Each has a `check` script (lint + typecheck + tests) and a trivial passing test.
- contracts/: foundry.toml (solc 0.8.24+, via-ir off, optimizer on), OpenZeppelin 5.x and
  forge-std as submodules or soldeer deps, remappings, the interfaces from specs/contracts/ copied
  into contracts/src/interfaces/ with a test that fails if they drift from specs/ (byte compare).
- .github/workflows/ci.yml running `pnpm -r check`, `forge test`, `forge snapshot --check`, and the
  sim tests, with caching.
- A SessionStart hook in .claude/settings.json that installs Foundry via foundryup and runs
  `pnpm install` if node_modules is missing, so remote sessions are ready. Use the session-start-hook
  skill if available.
- docs/DECISIONS.md and docs/BUILD-LOG.md created with headers and your first entry.
- README.md updated with a "Developing" section.

Constraints: no application code yet beyond stubs. Do not vendor large assets. Pin versions.

Done when: `pnpm -r check` and `cd contracts && forge test` both pass here, CI config is valid
(lint it), and a fresh session following CLAUDE.md can run them. Commit on <branch>, push, and end
with a BUILD-LOG entry listing exact commands that were verified.
```

---

### Phase 1 – Contracts

Run as several sessions on the same branch; each continues from the previous BUILD-LOG entry. The
first session's prompt:

```
You are implementing the Stock Miner season contracts. Read, in order: CLAUDE.md,
specs/contracts/*.sol, docs/05-TECH-SPEC-CONTRACTS.md (all of it; §5 is the accounting math and
§5.3 the invariants), docs/03-GAME-DESIGN.md, specs/params/season-default.json, and
docs/01-PRD.md §7 for requirement ids.

Goal: a complete, immutable, test-proven implementation of RIG, SeasonMine, StockFragments,
RedemptionVault and SeasonFactory that satisfies every FR in PRD §7.1–7.5 and every invariant in
spec §5.3.

Before coding, write your plan to docs/BUILD-LOG.md: the order you will build in, which tests you
will write first, and anything in the spec you believe is wrong or under-specified. Then proceed
without waiting.

Non-negotiable tests (add more as you see fit):
1. Invariant suite (Foundry invariant testing with a handler that activates, upgrades, overclocks,
   exits, claims, withdraws, pokes and warps time by random amounts, including warps that cross
   many shifts at once). Assert all nine invariants in spec §5.3.
2. Pace-replay scenario: the same sequence of player actions, expressed in *mine progress*
   (e.g. "Bo overclocks at 37% of shift 3"), replayed at three total-hash levels so the season
   lasts ~6h, ~24h and ~3 weeks. Final fragment balances per rig must be identical to within
   documented dust. This is the test that proves the game is pace-agnostic.
3. The worked example in docs/03 §7, reproduced to the fragment.
4. Boundary exactness: a shift end computed retroactively after a long idle period equals the one
   computed by a poke at that moment, to 1e-18 s.
5. Idle mine: totalHash == 0 for an interval mints nothing and advances no work; resuming works.
6. Fail-safe close mid-block: earned-so-far claimable, remainder unmined, later pools untouched.
7. Overclock edge cases: bought 1 second before a shift ends; three active then GPU upgrade
   recomputes ocHash and moves the ocExpiring bucket; exit with active overclocks fixes totalHash.
8. Claim cap: fuzz that mintedFragments[b] never exceeds the pool even with rounding.
9. Access and phase gating for every external function, with the custom errors from the interface.
10. Vault: redeem gated by IEligibility, cashOut with stale oracle reverts, sweep timing,
    fund() refuses to run twice and the mine refuses to open unfunded.

Mocks in contracts/test/mocks/: a Stock Token ERC-20 with an allowlist transfer hook (models the
expected Robinhood restriction), a v2-style LP pair, a price oracle with settable staleness, an
eligibility adapter.

Engineering constraints: Solidity 0.8.24+, OpenZeppelin 5, custom errors, no upgradeability, no
setters, `nonReentrant` on state-changing entry points, `Math.mulDiv` for three-factor products,
NatSpec on every external function referencing the FR id it satisfies. Gas targets are in spec §10;
record a `forge snapshot` and explain any target you cannot meet.

If you find the spec's math wrong (for example the overclock bucket handling on GPU upgrade, or the
rounding argument for boundary exactness), fix the spec text and the interface in the same commit
and log it in docs/DECISIONS.md. Do not silently deviate.

Out of scope: anything in PRD §11 v1.1. Do not add features the spec does not have.

Work in this order unless your plan says otherwise: RIG and mocks → SeasonMine settlement math with
the boundary-exactness and pace-replay tests failing first → rig actions → claims/exit/withdraw →
StockFragments → RedemptionVault → SeasonFactory validation → invariant campaign (≥ 1M runs locally,
report the config) → gas pass → adversarial self-review of the full diff as if you were the auditor,
fixing what you find.

Commit after each green milestone on <branch> and push. Finish with a BUILD-LOG entry: what shipped,
test counts and invariant run config, gas table vs targets, known gaps, and the exact next step for
the following session.
```

Follow-up sessions in phase 1 use:

```
Continue the Stock Miner contracts build on <branch>. Read CLAUDE.md, then the latest entry in
docs/BUILD-LOG.md and docs/DECISIONS.md, then `git log --oneline -30`. Run `forge test` to confirm
the starting state. Pick up the "next step" from the log. Same rules and exit criteria as the
phase 1 prompt in docs/10-BUILD-PLAN.md. If everything in phase 1 is done, run the audit-style
self-review across the whole contracts package, fix findings, and write the hand-off for phase 3
(ABI location, deployment script for Anvil with a funded demo season at a fast pace).
```

---

### Phase 2 – Economic simulation (parallel with phase 1)

```
You are building the Stock Miner economic simulation. Read CLAUDE.md, docs/03-GAME-DESIGN.md,
docs/04-TOKENOMICS.md (§5 especially), docs/02-MINING-MODEL.md §5, specs/params/season-default.json,
and docs/05-TECH-SPEC-CONTRACTS.md §5 so the sim's math matches the contracts exactly.

Goal: an agent-based Python model in sim/ that answers, with numbers, whether the default parameters
produce a healthy season, and that gives the operator a difficulty-sizing tool.

Deliver:
- A pure-Python reference implementation of the mine's accounting (work, shifts, boundaries,
  per-rig pay, heat, overclock expiry, exit, fail-safe) that mirrors spec §5. Property tests
  (hypothesis) for the nine invariants. This doubles as an oracle the contracts team can
  differential-test against: expose a CLI that takes a JSON action trace and emits final balances.
- Player strategy agents: passive staker, early GPU maxer, cooling-and-continuous-overclock, finale
  overclocker, LP staker, early exiter, latecomer, whale. Parameterised by stake size and RIG price
  belief.
- Scenario runner: N players drawn from a mix, RIG price path, pool value; outputs season duration,
  burn (total and median per rig), reward Gini, ROI per strategy in RIG terms, exit rate, and whether
  any strategy dominates. Monte-Carlo over mixes.
- Difficulty sizing tool: given expected stake and multiplier distributions, recommend D_total and
  show the duration distribution; flag when the fail-safe is at risk.
- A short report docs/SIM-REPORT.md with findings and concrete parameter change proposals, each
  with the evidence. If a default in specs/params/season-default.json is clearly wrong, change it,
  update docs/03 and docs/04 tables, and log the decision in docs/DECISIONS.md.

Constraints: Python 3.11, uv, numpy allowed, no notebooks as the deliverable (a script + markdown).
Match the contract's integer/rounding semantics where they matter (boundary flooring, whole-fragment
claims). Fast: a 1,000-player season should simulate in seconds.

Done when `uv run pytest` is green, the CLI runs on the default params, the report exists, and the
BUILD-LOG entry states which parameters you recommend changing and why. Commit on <branch>, push.
```

---

### Phase 3 – App, indexer, keeper

```
You are building the Stock Miner app. Read CLAUDE.md, docs/06-TECH-SPEC-APP.md, docs/03-GAME-DESIGN.md
§8 (UX beats), docs/01-PRD.md §7.6 and §8, docs/07-COMPLIANCE-AND-RISK.md §4–5, and the phase 1
hand-off in docs/BUILD-LOG.md (ABI location and the Anvil demo-season script).

Goal: the full player loop against a local Anvil demo season: activate, upgrade, overclock, watch
progress and ETA, claim found blocks, exit, withdraw after close, redeem or cash out. Plus the
indexer for leaderboards and a keeper for poke().

Deliver, in this order:
1. Chain layer: typed contract bindings from the ABI, a single multicall for global state, per-rig
   reads, and a pure TypeScript module that reproduces spec §5 estimate and ETA math. A parity test
   runs 1,000 fuzzed states against Foundry's pending()/eta() via Anvil and must match exactly.
2. /mine in all four phases, with the live density and long-haul density from spec §2. Every
   duration is labelled "est." The fail-safe date appears only on a details page, labelled as a
   fail-safe. Transaction previews show burn, new hashrate, fragments/s, mine coverage, break-even
   hint (labelled estimate). Errors map to plain text.
3. /mine/new, /claim, /redeem (eligibility check before the flow), /leaderboard, /, /seasons.
4. indexer/: Ponder schema from spec §5 and handlers for every event; a REST/GraphQL read API.
5. ops/keeper.ts calling poke() when the next shift ETA has passed; ops/watch.ts alerts.
6. Playwright e2e that drives a whole season on Anvil at fast, planned and slow paces using time
   warps, asserting the UI's claimed balances equal on-chain balances at the end.
7. Reduced-motion support, mobile layout, ≤ 2s initial /mine load on a throttled profile.

Constraints: the app must work with the indexer down for every critical action. No client compute
beyond animation; the hashrate visualiser is a seeded PRNG and carries the "cosmetic" tooltip.
Geo-fence middleware with a config-driven country list and a self-attestation modal. No PII.

Use the landing-page-design skill for `/` and the artifact-design/dataviz skills for the progress
and leaderboard visuals if available. Keep the design system small and consistent.

Done when the Playwright season passes at all three paces, the parity test is exact, `pnpm -r check`
is green, and the BUILD-LOG entry includes screenshots' paths for each phase state. Commit on
<branch> and push frequently; split into multiple sessions if needed, following the phase 3
continuation pattern from docs/10-BUILD-PLAN.md.
```

Continuation prompt for phase 3 follows the phase 1 pattern (read CLAUDE.md, BUILD-LOG, DECISIONS,
git log; confirm green; pick up next step).

---

### Phase 4 – Hardening and deployment

```
You are hardening Stock Miner for audit and testnet. Read CLAUDE.md, docs/05-TECH-SPEC-CONTRACTS.md
§9, docs/07-COMPLIANCE-AND-RISK.md, docs/08-DELIVERY-PLAN.md §3–4, docs/DECISIONS.md, and the last
three BUILD-LOG entries.

Goal: a package an external auditor can start on Monday, and a testnet season that can be run
end-to-end by ops scripts alone.

Deliver:
1. Security pass on contracts/: run slither and any available static analysis; write and run a
   differential fuzz between the Solidity SeasonMine and the Python reference in sim/ over random
   action traces (≥ 100k traces); extend the invariant campaign to ≥ 10M runs with a wider handler
   (multiple wallets, many rigs per wallet, LP and RIG mixed, pauses). Fix everything you find. Use
   the security-review skill on the final diff.
2. Audit package docs/AUDIT-PACKAGE.md: scope, trust assumptions, actors and powers, the accounting
   argument in prose with the invariants, known limitations, test/coverage/gas summary, how to run
   everything.
3. Deployment: forge scripts for factory deployment and season creation from a params JSON, with
   dry-run and verification; ops/plan.ts computes lpWeightPerToken (24h TWAP) and difficulty from
   the sizing model in docs/04 §5.2 and validates against factory rules; ops/fund.ts; ops/sweep.ts.
   Target chain config is parameterised; add a `robinhood-testnet` profile with placeholders and a
   README on what to fill in once PRD §10 assumptions are verified.
4. Testnet dry run on a local Anvil "long" season (sized to run ~1 week, then time-warped) driven
   only by ops scripts and the keeper, with the app pointed at it. Document the runbook in
   docs/RUNBOOK.md: pre-open checklist, on-call, alert responses, pause/cancel procedure, sweep.
5. Docs sync: every doc in docs/ matches the code. Where they diverged, fix the doc and log why.

Constraints: no new features. Any finding that needs a behaviour change goes through
docs/DECISIONS.md. Do not touch v1.1 items.

Done when slither is clean or every finding is triaged in the audit package, the differential fuzz
and invariant campaigns pass with their configs recorded, the dry run completes from the runbook
alone, and CI is green. Commit on <branch>, push, and write the final BUILD-LOG entry with a
release-readiness checklist against docs/08 §4.
```

## 4. Starting right now

1. Open a Claude Code session on this repo, branch `claude/robinhood-mining-game-prd-cvo4ee` or a
   new `build/phase-0` branch, and paste the Phase 0 prompt.
2. When it reports done, open two sessions in parallel: Phase 1 (contracts) and Phase 2 (sim).
   Use separate branches (`build/contracts`, `build/sim`) or worktrees; merge sim first, it only
   touches `sim/` and docs.
3. Phase 3 once the contracts hand-off exists. Phase 4 once phases 1–3 are merged.

Before phase 4, the two decisions the build cannot make for you: open question Q1 (which stock
tokens, and therefore what the eligibility adapter must do) and Q3 (which DEX, and therefore whether
LP staking ships in v1). Everything else has a recommended default and the build uses it.
