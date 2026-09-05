# Testing and audits

## What the tests prove

The contracts are tested against nine invariants that are stated in the technical specification and checked by fuzzing, where a harness performs random sequences of actions (activate, upgrade, overclock, claim, exit, pause, emergency withdraw, time warps) and the invariants must hold after every one:

1. The fragments a block has paid plus what it still owes never exceed its pool.
2. The mine's total hashrate equals the sum of every active rig's hashrate after every transaction.
3. The overclock expiry schedule matches the rigs' active overclocks.
4. A rig's earnings do not depend on when or how often its bookkeeping is settled.
5. When a block is found, the work done in it equals its difficulty (up to documented dust).
6. Shift boundaries are monotone.
7. Heat and active overclocks stay within their limits.
8. After close, the mine holds exactly the un-withdrawn deposits.
9. After close, no rig's earnings change.

The release run executed **over ten million** random handler calls against these invariants without a failure.

## Differential testing

A separate reference implementation of the accounting, written in Python for the economic simulation, is run against the contracts on **100,000 randomly generated seasons**. Every rig's earnings, heat and overclock state must match at every claim. The result was zero mismatches. Two independent implementations agreeing on random inputs is the strongest evidence that the pay formula on chain is the one described in these docs.

## Scenario tests

Full seasons are replayed end to end: the worked example from the game design, a season ended by the cap, a season on a burn-less token like $RIG, pause and cancellation, and the app's own browser test which activates, upgrades, overclocks, finds a block, claims, closes, withdraws and redeems against a local chain.

## Static analysis

Slither runs in continuous integration on every change with 76 detectors; high findings fail the build. The remaining findings are triaged in the audit package.

## Gas and size regressions

Gas snapshots are checked on every change so a regression is visible in review. Contract sizes are checked against the EVM limit.

## External audit

The external audit is commissioned by the operator. The audit package handed to the auditor (scope, trust assumptions, actors and powers, the accounting argument, invariants and where they are tested, known limitations and the questions the auditor is asked to focus on) is published in the repository as `docs/AUDIT-PACKAGE.md`. When the report is available it will be linked here.

{% hint style="info" %}
No amount of testing makes a contract risk-free. The design limits what a bug could do: the mine holds only deposits, minting is capped at the pool, and a pause with a bounded grace period lets players withdraw. See [Risks you take](risks-you-take.md).
{% endhint %}
