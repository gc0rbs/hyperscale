# Response to the codebase audit of 2026-09-04

Every finding in `CODEBASEAUDIT20260904.md` (report-only, audited commit `e658a57`) with what changed
and where the regression test lives. Findings B9, B13, I5 and I6 had already been fixed on this branch
between the audited commit and the audit's delivery; they are listed for completeness.

| # | Severity | Finding | Resolution | Regression test |
|---|---|---|---|---|
| B1 | Critical | Next 15.1.2 / React 19.0.0 (React Flight RCE, GHSA-9qr9-h5gf-34mp) | Next 15.5.25, React 19.2.8, Playwright 1.62; pnpm overrides for `ws`, `postcss`, `sharp`, `vite`, `kysely`, `drizzle-orm`, `@hono/node-server`. `pnpm audit --prod`: 0 critical, 0 high (7 moderate, 1 low, all transitive) | CI step `pnpm audit --prod --audit-level high` |
| B2 | High | Logical close can leave `closeX` unset so redemption never opens | The vault already pokes before every redemption/sweep on this branch. Added: the keeper pokes once when `phase == Closed && closeX == 0` then stops (`keeperDecision`); the closed screen shows "Record the close" (a `poke`) while the close is unpersisted; the redeem page explains the state | `ops/test/keeper.test.ts`; `Vault.t.sol` sweep/redeem self-heal already covered |
| B3 | High | Factory accepts zero eligibility / oracle / usdc | `SeasonFactory.create` reverts `InvalidParams("vault dependencies")`; `validateVaultDeps` mirrors it in `ops plan` | `Gating.t.sol::test_factory_rejects_zero_vault_dependencies`, `ops/test/validate.test.ts` |
| B4 | Medium | Cancelled season keeps advancing | `_advanceView` returns when `cancelled`: shift, boundaries, work and close freeze at the cancellation instant; later emergency withdrawals settle against that state | `Mine.t.sol::test_cancelled_season_is_frozen`, invariant 10 (`invariant_10_frozen_after_cancel`) |
| B5 | Medium | Indexer records tx time, not discovery time | `foundAt` / `closedAt` = `endX / 1e18`; the tx timestamps kept as `foundTxAt` / `closedTxAt` | indexer typecheck; replay reconciliation is manual (see §Rerun) |
| B6 | Medium | Indexed heat / overclocks go stale | `ShiftEnded` applies overclock expiry and cooling to every active rig; settlement events (`GpuUpgraded`, `CoolingUpgraded`, `Claimed`) re-read the rig from the contract (`syncRig`) | as above |
| B7 | Medium | Failed transactions lock controls or read as success | One `useTx` hook for every write flow: busy is derived from wagmi, a mined receipt is success only when `receipt.status == "success"`, errors are mapped to plain language (`friendlyError`) | e2e `paused: a failed purchase shows an error and the sheet recovers` |
| B8 | Medium | RPC failure = endless loading | `useReads` surfaces per-call failures as errors; `SeasonShell` shows an error state with Retry after an error or 10 s without data, and keeps the last good snapshot with a banner when refetches fail | manual (RPC down) |
| B9 | Medium | No mobile navigation | Fixed before the audit landed (section links row below `md`) | mobile QA script |
| B10 | Medium | Coverage percentage wrong | `coverage()` in `mine-math`: remaining work ÷ total work for tiers, rest-of-shift + span for overclocks (capped at close) | `test/mine-math.test.ts` |
| B11 | Medium | UI hardcodes 8 / 32 / 30 days / 1% / tickers | `SeasonParamsView` carries `redemptionDays`, `cashOutFeeBps`, `pauseGraceSeconds`; total shifts from params everywhere; symbols read from the Stock Tokens (`snap.symbols`, fallback to the season-1 set) | app typecheck; symbols verified against mocks in e2e |
| B12 | Medium | `ops fund` crashes on a demo artifact | `resolveFunding`: pool from the mine's `params()` and reserve from `--usdc-reserve` when the artifact has no season file; asserts the mine left Funding | `ops/test/fund.test.ts` |
| B13 | Low | Notifications never sent | Fixed before the audit landed (`useMineNotifications`) | manual |
| B14 | Low | Fragment metadata accepts invalid ids | 400 / 404 on bad ids; symbols and `fragPerToken` read from the deployed season, cached 60 s | manual (`/api/frag/9` → 404) |
| R1 | High | Anvil keys as default signers | Forge scripts and `ops clients()` fall back to the Anvil key only on chain 31337; elsewhere the role key is required | `ops` typecheck; scripts reviewed |
| R2 | High | Guardian can freeze claims after close | `pause()` reverts once the close is persisted; `claim`, `claimAll` and `withdraw` ignore a pause when `closeX != 0` (`whenNotPausedOrClosed`). A cancelled season has `closeX == 0`, so forfeiture is unchanged | `Gating.t.sol::test_pause_after_close_reverts_and_claims_ignore_pause`, `Mine.t.sol::test_FR_S6_pause_outliving_close_does_not_cancel_or_block_claims` |
| R3 | Medium | Two chain-id sources, unvalidated env addresses | Single `NEXT_PUBLIC_CHAIN_ID` (done before the audit landed); `getDeployment` now validates every env address and the four stock addresses at startup | app typecheck |
| R4 | Medium | No security headers | `next.config.ts`: nosniff, frame deny, referrer, permissions, HSTS, `poweredByHeader: false`. CSP left to the edge (WalletConnect needs host-specific allowances), RUNBOOK §10 | `next build` |
| R5 | Medium | Gas snapshot not reproducible | CI pins `foundry-toolchain` to v1.5.1 (the version the snapshot was generated with); snapshot regenerated | CI |
| I1 | Medium | App ignores the indexer | `NEXT_PUBLIC_INDEXER_URL`: leaderboard shows wallet rankings (base hash / claimed / burned) from `/leaderboard`, the mines page shows the current mine's summary from `/season`; chain reads remain the fallback | manual with Ponder |
| I2 | Medium | Hash ranking excludes overclocks | Labelled "base hash" in the API docs and the app; the chain rig table is labelled "incl. overclocks" | |
| I3 | Medium | Previews below spec | Fragment estimate at the current pace, frag/s after, coverage for cooling and overclocks, final-shift warning, estimate disclaimer. Permit is not implemented: the Pons $RIG has no EIP-2612 | `test/mine-math.test.ts` (`estimateFragments`) |
| I4 | Low | Keeper pokes too early | Pokes only when the simulated shift is ahead of the stored one or the view is >10 min stale | `ops/test/keeper.test.ts` |
| I5 | Medium | Watcher alerts only to stdout | Fixed before the audit landed (`ALERT_WEBHOOK_URL`, repeat suppression) | Anvil smoke test |
| I6 | Low | Stale README | Fixed before the audit landed | |

## Coverage gaps from the audit, addressed

- Contract: cancellation freeze (test + invariant 10); post-close pause behaviour; factory zero
  dependencies; close persistence via the keeper decision test.
- App: a failed purchase in the browser (paused mine) shows the error and recovers.
- Ops: keeper decision and funding-artifact handling are unit-tested.
- Still open: indexer automated tests, wrong-chain with a real extension, refresh during confirmation,
  visual regression. Listed in the build log as known gaps.

## Rerun of the validation matrix (this branch)

See the dated entry in `docs/BUILD-LOG.md` for the results of: workspace checks, production build,
Foundry suite, the 10.24M-call invariant campaign, the 100k-trace differential campaign, the browser
suite, and the dependency audit.
