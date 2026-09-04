# Simulation report – do the season-default parameters make a healthy season?

Date: 2026-09-03. Scope: `sim/` (Phase 2). Everything below is reproducible with the commands in §2;
raw runs are deterministic per `--seed`. This report **proposes** parameter changes; it does not edit
`specs/params/season-default.json`, `docs/03` or `docs/04` (the contract tests pin the current
defaults). Another session integrates what is accepted.

## 1. Headline

1. **The reference implementation reproduces the spec to the fragment.** docs/03 §7 gives Ann
   1,794,872 / Bo 2,564,103 / Cy 641,026 NVDAx fragments; those are *rounded*. The contract floors
   (`earned / 1e18`), so the exact answers are **1,794,871 / 2,564,102 / 641,025** (sum 4,999,998 of a
   5,000,000 pool). The pace-replay property holds exactly: the same progress-expressed script at
   0.25×, 1×, 4× hash and at 0.25×, 1×, 21× difficulty gives *bit-identical* per-rig fragment counts
   (difference 0 in every cell, see §3).
2. **One ratio decides everything: ρ = pool value in RIG ÷ total hash** (RIG-equivalent). Every
   purchase costs a fixed fraction of the rig's own stake and pays `Δhash / totalHash × pool`, so the
   ladder has a break-even ρ per item (§4). Under the defaults GPU tier 1 needs ρ ≥ 0.20, tier 3 ρ ≥
   0.45, tier 5 ρ ≥ 0.90; an overclock needs ρ ≥ 0.40 even for a tier-5 rig in block 4.
3. **At the pool/TVL the docs imply (ρ ≈ 0.25–0.35) the upgrade shop is nearly dead.** Baseline
   (1,000 players, 20 Monte-Carlo mixes, $150k pool, $0.05 RIG, ≈10.6M RIG-eq staked → ρ = 0.27):
   total burn **3.7 %** of stake (p5–p95: 0–11 %), **median rig burns 0 %**, realised average multiplier
   1.10× (docs assume 1.4×), season 21 h (12–30 h) against a 24 h plan, exit rate 7 %, reward Gini 0.75
   (stake Gini 0.72, i.e. rewards track stake), 4 % of players end with negative ROI, passive staking
   returns +26 % in RIG terms for a one-day lock. docs/04 §2's target "median rig burns 10–30 %" is not
   met; it is met only at ρ ≥ 0.37 (pool ≥ ~0.6 × TVL value).
4. **The healthy band is ρ ≈ 0.35–0.55.** There total burn is 20–60 % of stake, the median rig burns
   10–20 %, no strategy dominates (best-median winner alternates between LP staker and the continuous
   overclocker), the season runs 0.5–0.75× the planned pace and burn converts 45–62 % of the pool's RIG
   value into RIG destroyed. Above ρ ≈ 0.6 whales and continuous overclockers earn 2.7–4× passive,
   the median rig burns the full 50 % GPU ladder and the season collapses to 0.43× planned.
5. **Sizing is fine, the multiplier assumption is not.** With 7M RIG-eq staked the current
   `difficultyTotal = 8.64e11` gives a 25 h median season (p5–p95: 11–58 h), 90 % of turnout draws in
   the ¼–2× design range and no fail-safe risk unless expected stake falls below ~1.5M RIG. But the
   average multiplier is ρ-dependent (1.0 at ρ < 0.2, 1.15 at 0.3, 1.5 at 0.37, 2.0 at 0.42, 2.5–2.8 at
   ≥ 0.6), so "1.4×" is only right at ρ ≈ 0.35. Size from the simulation (`python -m sim.sizing
   --from-sim 10`), not from a constant.
6. **Recommended changes** (§7): size the pool to a target ρ ≈ 0.4 instead of "k × expected burn";
   flatten the GPU ladder to `[300, 400, 600, 900, 1300]`; cut cooling to `[200, 300, 500]`; keep
   overclock cost and span as they are; decide explicitly whether the LP staker should be the best
   strategy in every season (it is, by +25–35 % ROI on deposit, at every ρ ≤ 0.4); fix the rounded
   numbers in docs/03 §7.

## 2. What was built and how to run it

| Module | Purpose |
|---|---|
| `sim/sim/mine.py` | Pure-Python `SeasonMine` accounting mirroring docs/05 §5.1/§5.2 with the contract's integer semantics (X-time = s × 1e18, floored spans, `mulDiv` order). `advance_to_progress` drives a mine by *progress* so a script can be replayed at any pace. |
| `sim/sim/replay.py` | `python -m sim.replay trace.json [--params …] [--json]` – differential-testing oracle: JSON action trace in, per-rig fragments per block, minted totals, shift boundary X-times and every revert (by contract error name) out. Rig ids are 0-based in activation order, as in `SeasonMine`. |
| `sim/sim/value.py` | Valuation and the analytic break-even ratios of §4. |
| `sim/sim/agents.py` | Eight strategies (passive, gpu_maxer, cooling_oc, finale_oc, lp_staker, early_exiter, latecomer, whale), parameterised by stake, RIG price belief, expected crowd multiplier and a `hurdle` (1.0 = rational; 0.5 = "enthusiast who buys at half the break-even"). |
| `sim/sim/run.py` | `python -m sim.run --params ../specs/params/season-default.json [--players N --seed S --rig-price P --pool-usd V --runs R --mix … --hurdle …]` – one season in ≈0.2 s for 1,000 players; `--runs` Monte-Carlos over Dirichlet-perturbed mixes and stakes. |
| `sim/sim/sizing.py` | `python -m sim.sizing --params … [--stake-total 7e6 --turnout-sigma 0.5 --mults 1.0:0.45,… \| --from-sim 10]` – recommends `difficultyTotal`, prints the duration distribution and flags fail-safe / too-fast risk. |
| `sim/tests/` | 21 tests: params (2); worked example (3); hypothesis stateful machine checking all nine docs/05 §5.3 invariants after every random action with time warps (150 examples × 60 steps) plus a settlement-frequency test (2); pace replay (6); replay CLI (2); agents/runner/sizing (6). `cd sim && uv run --extra dev ruff check . && uv run --extra dev pytest -q` is green in ≈5 s. |

Units: difficulties in the params JSON are whole hash × seconds and are multiplied by 1e18
(`ContractParams.from_json`); pool tokens are 1e18-scaled and `S_b = poolTokens × fragPerToken`
fragment-wei; `ratePerWork[b] = S_b × 1e18 / D_b` (for block 1: 2.8935e13).

## 3. Reference implementation checks

**Worked example (docs/03 §7).** With exact-progress re-buys of Bo's three overclocks at the start of
shifts 0, 2, 4, 6, block 1 lasts 8,861.54 s (spec: 8,862 s) and pays Ann 1,794,871, Bo 2,564,102, Cy
641,025 fragments; burns are exactly 500,000 / 1,475,000 / 0 RIG. The "202.6 fragments/s" Ann sees is
202.55. With whole-second timestamps (what a chain does) Bo's re-buys land ≤ 1 s after each boundary,
so Bo loses up to ~290 fragments per re-buy and the block runs slightly longer, paying Ann and Cy
slightly more. The test asserts both regimes.

**Pace replay.** A 22-action script (joins, GPU buys, an exit, overclocks at fractional shift positions
including 0.999) replayed with exact X-time targeting at five paces:

| pace | duration | max per-rig, per-block fragment difference vs 1× |
|---|---|---|
| ¼ × difficulty | 3.3 h | 0 |
| ¼ × all stakes | 52 h | 0 |
| 4 × all stakes | 3.3 h | 0 |
| 21 × difficulty | 274 h | 0 |

So the documented 1e-18 s boundary dust never reaches a whole fragment. **With whole-second
timestamps** the same script drifts by up to 1 s per action, which is a *second* dust term of order
`1 s × rigHash × ratePerWork` per action: at 3.3 h the total absolute deviation across 16 rig-blocks is
2,989 fragments (0.01 % of the 27M-fragment pool; the continuous overclocker loses 1,477, the others
gain), at 13 h 1,561, at 274 h 61. The contracts' pace-replay test should size its tolerance as
`(actions × max rig hash × rate)` in seconds, not as 1e-18 dust.

**Invariants.** All nine hold over random sequences (activate RIG/LP, GPU, cooling, overclock ×1–3,
claim, claimAll, exit, withdraw, settle-only, time warps of 0 s–200,000 s, fractional advances) on a
difficulty scaled so that runs cross the whole season and sometimes the fail-safe. Invariant 5 (Σ
work in a found block = D_b) holds within `(spb+1) × maxTotalHash/1e18 + 4 × settlements` work units,
and invariant 4 (settlement-frequency independence) within 64 wei of a fragment.

## 4. The break-even table (why ρ is the whole story)

A rig of weight `W` with multiplier `m` in a mine of total hash `H` earns `m·W/H × pool`. An item costing
`c·W` that adds `Δm·W` of hash over a fraction `f` of the remaining pool value pays iff
`Δm·f·pool/H > c`, i.e. iff **ρ = pool_RIG / H > c / (Δm·f)**. With the defaults:

| purchase | Δm | cost | break-even ρ (bought pre-open) | at 50 % of season left |
|---|---|---|---|---|
| GPU tier 1 | +0.2 | 4 % | **0.20** | 0.40 |
| GPU tier 2 | +0.2 | 6 % | **0.30** | 0.60 |
| GPU tier 3 | +0.2 | 9 % | **0.45** | 0.90 |
| GPU tier 4 | +0.2 | 13 % | **0.65** | 1.30 |
| GPU tier 5 | +0.2 | 18 % | **0.90** | 1.80 |

| one overclock at a shift start (covers 2 of 8 shifts) | block 1 (15 % value) | block 2 (20 %) | block 3 (25 %) | block 4 (40 %) |
|---|---|---|---|---|
| tier-0 rig (+0.5) | 1.07 | 0.80 | 0.64 | **0.40** |
| tier-2 rig (+0.7) | 0.76 | 0.57 | 0.46 | **0.29** |
| tier-5 rig (+1.0) | 0.53 | 0.40 | 0.32 | **0.20** |

Cooling only pays as an enabler of an overclock programme, so it needs ρ above the overclock line.
Two consequences: (a) the finale is the only place overclocks make sense for most rigs, as designed,
but only at ρ ≥ 0.3–0.4; (b) the theoretical 162 % max burn (50 + 16 + 96) is reached by the agents
exactly when ρ ≥ 1 (`whale`/`cooling_oc` rows in §5.1).

To translate ρ into the docs' quantities: `ρ = pool_USD / (RIG_USD × TVL_RIG × avg_mult)`. For the
docs' example (7M RIG at $0.05, $150k pool, 1.15× realised) ρ = 0.37; for the simulation's default
population (10.6M RIG-eq because 2 % of players are 10–50× whales) ρ = 0.27.

## 5. Results

All runs: 1,000 players, stakes lognormal (median 3,000 RIG, σ = 1.2), whales 2 % at 10–50×, price
beliefs lognormal σ = 0.25 around $0.05, rational hurdle 1.0, mix Dirichlet-perturbed around
passive 30 / gpu_maxer 15 / cooling_oc 10 / finale_oc 15 / lp_staker 10 / early_exiter 8 / latecomer 10 /
whale 2 %. ROI is in RIG terms on the deposit, net of burn, activation and exit fees, valuing fragments at
the pool's USD value ÷ the true RIG price. "burn eff." = RIG burned ÷ pool value in RIG.

### 5.1 Pool sweep (6 runs each; TVL ≈ 10.6M RIG-eq)

| pool | ρ | pool/TVL | duration ÷ plan | avg mult | burn total | burn median rig | burn eff. | passive ROI | best strategy (ROI) | negative-ROI players | Gini reward/stake |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $30k | 0.08 | 0.07 | 1.25× | 0.94 | 0.0 % | 0 % | 0 % | +7 % | lp_staker (+8 %) | 5 % | 0.07 |
| $60k | 0.15 | 0.14 | 1.25× | 0.95 | 0.0 % | 0 % | ~0 % | +14 % | lp_staker (+18 %) | 4 % | 0.07 |
| $100k | 0.23 | 0.24 | 1.17× | 1.01 | 1.4 % | 0 % | 7 % | +23 % | lp_staker (+29 %) | 3 % | 0.10 |
| **$150k** | **0.30** | 0.35 | 1.00× | 1.15 | **5.9 %** | **2 %** | 21 % | +30 % | lp_staker (+40 %) | 3 % | 0.15 |
| $250k | 0.37 | 0.59 | 0.74× | 1.50 | 21.3 % | 10 % | 45 % | +37 % | lp_staker (+53 %) / cooling_oc | 4 % | 0.23 |
| $400k | 0.42 | 0.94 | 0.53× | 2.00 | 47.1 % | 19 % | 62 % | +46 % | none (cooling_oc +78 %, lp +67 %) | 5 % | 0.29 |
| $700k | 0.61 | 1.65 | 0.44× | 2.53 | 75.2 % | 50 % | 57 % | +69 % | whale (+186 %) | 4 % | 0.36 |
| $1.2M | 1.03 | 2.82 | 0.43× | 2.72 | 79.7 % | 50 % | 35 % | +114 % | whale (+414 %) | 3 % | 0.40 |
| $2.5M | 2.14 | 5.88 | 0.43× | 2.77 | 81.1 % | 50 % | 17 % | +238 % | whale (+1031 %) | 2 % | 0.45 |

Reading: burn is bounded by what the pool is worth in RIG. Burn efficiency peaks at 60 % around
ρ ≈ 0.4–0.6 and falls on both sides: below, nothing pays; above, the ladder saturates (everyone at
GPU 5 + cooling 3 + continuous overclocks = 162 %) and the excess pool value goes to players as yield.
The 24 h plan is hit at ρ ≈ 0.3 with a 1.15× multiplier; in the healthy band the same difficulty gives
a 13–18 h season.

### 5.2 Baseline with mix uncertainty ($150k, 20 runs)

ρ = 0.27 (mix perturbation moves TVL), duration 21.2 h (p5 12.4, p95 30.1), fail-safe 0 %, unminted
pool 0.01 %, exit rate 7.2 %, burn total 3.7 % (0.0–11.3 %), median rig 0 % (0–4.3 %), Gini of USD
reward 0.749 vs stake Gini 0.724, Gini of reward-per-stake 0.143, 4 % negative ROI. Strategy medians:
lp_staker +34.6 %, gpu_maxer / finale_oc / cooling_oc / whale +27.4–27.6 %, passive +26.0 %,
latecomer +17.5 %, early_exiter −0.3 %. `lp_staker` wins 20/20 runs → flagged dominant.

### 5.3 Behaviour sensitivity ($150k)

| players … | ρ | dur ÷ plan | burn total | median rig | passive ROI | best | negative ROI |
|---|---|---|---|---|---|---|---|
| rational (hurdle 1.0, belief σ 0.25) | 0.30 | 1.00× | 5.9 % | 2 % | +30 % | lp_staker +40 % | 3 % |
| noisier beliefs (σ 0.6) | 0.27 | 0.89× | 10.3 % | 0 % | +27 % | lp_staker +36 % | 5 % |
| enthusiasts (hurdle 0.7, σ 0.6) | 0.22 | 0.74× | 18.6 % | 4 % | +24 % | lp_staker +29 % | 10 % |
| enthusiasts (hurdle 0.5) | 0.22 | 0.73× | 20.1 % | 14 % | +22 % | **passive +22 %** | 9 % |
| cautious (hurdle 1.5) | 0.35 | 1.17× | 1.4 % | 0 % | +34 % | lp_staker +45 % | 2 % |
| believe crowd at 1.0× (vs 1.4×) | 0.28 | 0.93× | 8.8 % | 4 % | +28 % | lp_staker +37 % | 4 % |

Burn in the 10–30 % band at the docs' pool ratio requires players who over-pay by ~2× relative to
rational; those players then earn *less* than a passive staker (cooling_oc +12 % vs passive +22 % at
hurdle 0.5). That is the "burn comes from the enthusiasts, the shop punishes them" regime.

### 5.4 Mix extremes and turnout ($150k)

| population | ρ | dur ÷ plan | avg mult | burn total | median | note |
|---|---|---|---|---|---|---|
| all passive | 0.48 | 1.61× | 1.00 | 0 % | 0 % | 30 h season, +49 % yield for everyone |
| all cooling_oc | 0.30 | 0.99× | 1.67 | 22 % | 12 % | everyone re-buying halves each one's gain |
| all gpu_maxer | 0.35 | 1.17× | 1.39 | 10 % | 10 % | GPU tier 2 across the board |
| no whales | 0.38 | 1.26× | 1.26 | 11 % | 10 % | TVL 7.9M; ρ rises, shop wakes up |
| 60 players (0.8M) | 3.8 | 12.7× | 2.57 | 66 % | 50 % | 305 h "long haul"; no fail-safe |
| 200 players (1.8M) | 0.75 | 2.5× | 2.53 | 73 % | 50 % | whale dominant |
| 3,000 players (35M) | 0.12 | 0.41× | 0.95 | 0 % | 0 % | 10 h, zero burn |

The pool is fixed at funding, so **turnout moves ρ inversely**: a season funded for 7M RIG that
attracts 35M RIG has no shop at all, and one that attracts 0.8M becomes a whale casino that lasts
13 days. This is the main operational risk; PreOpen TVL is visible 48 h ahead, so the app should show
pool/TVL next to the ETA (§7, R1).

## 6. Difficulty sizing

`python -m sim.sizing --params ../specs/params/season-default.json --stake-total 7e6 --turnout-sigma 0.5`
(mixture multipliers 1.0:45 % / 1.4:25 % / 2.0:20 % / 3.5:10 %, Dirichlet-perturbed):

| | hash RIG-eq p5 / p50 / p95 | duration h p5 / p50 / p95 | P(¼–2× plan) | P(fail-safe) | p5 hash ÷ fail-safe floor |
|---|---|---|---|---|---|
| current `8.64e11` | 4.1M / 9.4M / 22.1M | 10.9 / 25.4 / 58.0 | 90 % | 0 % | 12.4× |
| recommended `8.15e11` | | 10.3 / 24.0 / 54.7 | 92 % | 0 % | 12× |
| pessimistic turnout 2M, σ 0.8, current D | 0.6M / 2.2M / 8.6M | 28 / 109 / 404 | 16 % | 0.7 % | 1.8× |

With `--from-sim 5` (multipliers measured by the agent model at ρ ≈ 0.3, median 1.18×) the
recommendation for 8.6M stake is `7.6e11`; for the docs' 7M it is ≈ `6.6e11`. The fail-safe floor is
333k hash (3.3 % of plan) – irrelevant unless expected stake is below ~1.5M RIG, where the tool flags
"THIN MARGIN". `maxDurationSeconds = 30 d` is adequate. The real sizing error is the multiplier: in
the healthy band (§5.1) the realised multiplier is 1.5–2.5×, so a season sized at 1.4× will run at
0.5–0.75× of plan. That is inside the design range, but the app's "sized for ~24 h" copy will be wrong
by 2×; publish the sim's number.

## 7. Parameter change proposals

Each with the evidence it rests on. R1 is the important one; R2–R3 are cheap improvements; R4–R5 are
decisions rather than tuning.

**R1 – Size the pool to a target pool ratio, not to expected burn (docs/04 §5.1).** Replace
`V = k × expected RIG burn` with `pool value in RIG ≈ ρ* × expectedTotalHash`, ρ* ≈ 0.4 (range
0.35–0.55), i.e. **pool ≈ 0.55–0.6 × expected TVL value** at the multiplier that ρ* itself induces
(~1.5×). `k` is then an output: burn efficiency is 45–62 % of pool value in that band (§5.1), so
`k ≈ 1.6–2.2` falls out of it – consistent with the docs' 1.5–3 only there. For season 1 at $0.05 and
7M RIG expected stake that is a **$190–220k** pool (the docs' $150k gives ρ = 0.37 at 7M, but 0.27 at
the 10.6M the model draws). Evidence: §5.1 rows $150k–$400k; §5.4 turnout rows. Also: show
`pool/TVL` (or the ETA-style "if the mine opened now, upgrades pay to tier N") in PreOpen, since
turnout is the one thing the operator cannot correct after funding.

**R2 – `gpuCostBps` `[400, 600, 900, 1300, 1800]` → `[300, 400, 600, 900, 1300]`** (cumulative 50 % →
35 %). Break-even ρ per tier becomes 0.15 / 0.20 / 0.30 / 0.45 / 0.65 (from 0.20 / 0.30 / 0.45 / 0.65 /
0.90), so tiers 1–3 pay in the docs' own ρ range. Variant V1, same population: at $150k burn 8.1 %
(from 5.9 %), median rig 5 % (from 2 %), duration 0.88× (from 1.00×); at $250k 26.1 % / 13 % (from
21.3 % / 10 %); no change in dominance or negative-ROI share (4 %). Max burn per rig falls to 147 %.

**R3 – `coolCostBps` `[300, 500, 800]` → `[200, 300, 500]`.** Alone it is worth +1.7 pp of burn at
$250k (V4); with R2 (V7) the mid-size finale overclocker's programme becomes +EV at ρ ≈ 0.3: at $150k
burn 8.8 % / median 5 %, finale_oc burns 15 % and still beats passive (+30 % vs +26 %); at $250k
25.5 % / 13 %. Dominance unchanged (lp_staker ≤ $250k, none at $400k).

**R4 – Keep `ocCostBps = 200`, `ocBoostBps = 5000`, `ocShiftSpan = 1`, `shiftsPerBlock = 8`.** Cheaper
overclocks (V2, 150 bps) add < 1 pp of burn at ρ ≤ 0.3 and only feed the continuous overclocker at
ρ ≥ 0.4 (+88 % vs passive +44 %). Longer overclocks (`ocShiftSpan` 3, V9; or 4 shifts per block, V6)
do raise burn at $150k to 10 % but make `cooling_oc` the best strategy from ρ ≈ 0.25 with 2.7× the
passive ROI, raise the reward-per-stake Gini to 0.32–0.33 and cut the season to 0.45–0.6× plan. The
overclock is correctly priced as a finale burst; leave it.

**R5 – Decide on `lpBonusBps = 12500` knowingly.** The LP staker is the best-median strategy in every
run with ρ ≤ 0.4 (49 of the 50 runs in §5.1–5.2) purely because ROI on deposit carries the 25 % weight bonus; the
model does not price impermanent loss or the second asset. If the intent is "LP should win", keep it
and say so in docs/04 §3; if not, 11,500 (+15 %) still leaves LP ahead of an identical RIG rig by the
bonus minus nothing. This is a policy choice, not a tuning result.

**R6 – Sizing copy and JSON.** Keep `difficultyTotal = 8.64e11` if the expected stake is 7–9M RIG-eq,
but replace the constant "1.4× average multiplier" in docs/03 §6 and docs/04 §5.2 with the sim's
ρ-dependent figure and run `python -m sim.sizing --from-sim 10 --stake-total <PreOpen TVL>` before
publishing the planned pace. Expect 0.5–1.0× of plan in the healthy band, not 1.0×.

**R7 – docs/03 §7 and §4 numbers.** Ann 1,794,871 (not 1,794,872), Bo 2,564,102, Cy 641,025; UI
rate 202.5 fragments/s (not 202.6); block-1 duration 8,861.5 s. docs/04 §2's "median rig burns 10–30 %
under realistic strategies" should be conditioned: "…when the pool is worth ≥ 0.35 × total hash in RIG
(≈ 0.5 × TVL); below that the shop is idle by design."

**Not recommended:** raising `earlyExitFeeBps` (exiters already lose 0–14 % depending on ρ, and the
exit rate is 6–9 %, all scripted); changing `maxDurationSeconds`; changing block value/difficulty
shares (the 40 %/30 % finale is what makes block-4 overclocks the first ones to pay).

## 8. Notes for the contracts team (spec vs implementation, found while building the oracle)

All of these are already consistent with `contracts/src/SeasonMine.sol` as committed today; they are
listed so the spec text can catch up and the differential fuzz knows what to expect.

1. `withdraw` must remove the rig's hash from `totalHash` (§6 does not say so; invariant 2 fails
   after close otherwise). The contract's `_removeHash` does; the reference does too.
2. `_settleRig` must be a no-op for inactive rigs, or `exit` must zero `baseHash`/`ocHash`; otherwise
   a claim after an exit keeps paying the rig. Both implementations skip inactive rigs and zero hashes.
3. `exit` is allowed in PreOpen with the fee (DECISIONS 2026-09-03); the spec table says Open only.
4. Ownership/inactive are checked before phase, so revert names in the oracle follow that order.
5. Settling in PreOpen sets `rig.lastX = toX < openTime × 1e18`; harmless because settlement clamps
   with `max(fromX, startX)`, but `lastX = max(toX, openX)` would be cleaner.
6. Invariant 1 as written (`poolTokens × fragPerToken × 1e18`) has a unit mismatch when `poolTokens`
   is 1e18-scaled; the bound is `Σ(earned + claimed × 1e18) ≤ poolTokens × fragPerToken`
   (fragment-wei). The reference asserts the latter.
7. Overclocks bought in shift 31 sit in `ocExpiring[32]`, never processed; invariant 3 must sum
   buckets `k ≥ shift` including that index (it does).
8. After a fail-safe close, unfinished blocks are claimable (`closeX != 0`), paying the partial pool.
9. Whole-second timestamps make replay tolerances a function of `actions × hash × rate` (§3), not of
   1e-18 dust; the reference's `advance_to_progress(..., whole_seconds=True)` reproduces on-chain
   timing, `whole_seconds=False` the exact-progress ideal.
10. `python -m sim.replay` reports reverts by contract error name and leaves state untouched, so a
    Foundry test can feed the same trace to both and compare `earned`, `minted`, `shiftEndX`, `closeX`.

## 9. Model limitations

- Agents are myopic and use a heuristic crowd estimate (`max(totalHash now, TVL × expected_mult)`);
  they do not anticipate other players' upgrades or a moving RIG price inside the season. Ex-post ROI
  is at the true price, beliefs only shape purchases.
- LP tokens are valued 1:1 RIG-equivalent before the bonus; impermanent loss and USDC exposure are
  ignored, which flatters `lp_staker` (§7 R5).
- Population: lognormal stakes, 2 % whales, fixed default mix perturbed by Dirichlet(40). Different
  populations move ρ (§5.4); the qualitative picture (burn is a function of ρ, healthy band
  0.35–0.55) is stable across every mix and hurdle tried.
- Fragment value is the pool's funding value; Stock Token price moves during the season are ignored.
- No collusion, no MEV, no gas costs (a 24 h season with continuous overclocking is ~16 re-buy
  transactions per rig; at the $700k row a cooling_oc rig buys ~40 overclocks).
