# Resolved season files

Written by `pnpm --filter @stock-miner/ops plan`, read by `contracts/script/CreateSeason.s.sol`
(`SEASON_FILE=…`). One file per planned season; the `paramsHash` inside is what `SeasonCreated`
emits and what gets published before `openTime`.

Local files are ignored by git except `*.example.json`. Commit the real season file for a chain
together with its `contracts/deployments/<chainId>.json` once the season is created, so the app and
ops scripts can be pointed at it from a clean checkout.

`anvil-dryrun.example.json` is the file the 2026-09-04 dry run in `docs/RUNBOOK.md` §9 used
(local mock addresses; illustrative only).
