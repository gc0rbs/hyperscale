/**
 * Deploy the season adapters for a chain profile (docs/RUNBOOK.md step 1b):
 *
 *   PRIVATE_KEY=0x… pnpm --filter @stock-miner/ops deploy-adapters --chain robinhood [--broadcast] [--verify …]
 *
 * Builds STOCKS/FEEDS from ops/chains/<name>.json (stocks and feeds keyed by symbol, in the params
 * template's block order) and runs contracts/script/DeployAdapters.s.sol through forge-script.sh.
 * Without --broadcast it is a dry run that also checks every feed answers with a live price.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./lib/artifacts.js";
import { arg, loadChainProfile } from "./lib/season.js";

const chainName = arg("--chain", "robinhood")!;
const paramsPath = arg("--params", join(REPO_ROOT, "specs", "params", "season-default.json"))!;
const chain = loadChainProfile(chainName) as ReturnType<typeof loadChainProfile> & { feeds?: Record<string, string> };
const tpl = JSON.parse(readFileSync(paramsPath, "utf8"));
const syms: string[] = tpl.stocks.map((s: { symbol: string }) => s.symbol);
const zero = /^0x0{40}$/i;
const stocks = syms.map((s) => chain.stocks?.[s]);
const feeds = syms.map((s) => chain.feeds?.[s]);
for (let i = 0; i < syms.length; i++) {
  if (!stocks[i] || zero.test(stocks[i]!)) throw new Error(`profile ${chainName}: no stock address for ${syms[i]}`);
  if (!feeds[i] || zero.test(feeds[i]!)) throw new Error(`profile ${chainName}: no feed address for ${syms[i]}`);
}
const passthrough = process.argv.slice(2).filter((a, i, all) => !["--chain", "--params"].includes(a) && !["--chain", "--params"].includes(all[i - 1] ?? ""));
const r = spawnSync("bash", [join(REPO_ROOT, "ops", "scripts", "forge-script.sh"), "DeployAdapters", ...passthrough], {
  stdio: "inherit",
  env: { ...process.env, RPC_URL: process.env.RPC_URL ?? chain.rpcUrl, STOCKS: stocks.join(","), FEEDS: feeds.join(",") },
});
process.exit(r.status ?? 1);
