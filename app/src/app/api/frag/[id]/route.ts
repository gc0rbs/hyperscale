import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { getDeployment } from "@/lib/deployment";
import { erc20Abi, stockFragmentsAbi, TICKERS } from "@/lib/contracts";

/** ERC-1155 metadata for fragment ids (block index). Audit B14: ids are validated and the identity
 *  comes from the deployed season (stock symbols, fragments per token), cached for a minute. */
let cache: { at: number; symbols: string[]; fragPerToken: number; blocks: number } | null = null;

async function seasonInfo() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const dep = getDeployment();
  if (!dep) return null;
  const client = createPublicClient({ transport: http(dep.rpcUrl, { timeout: 2000 }) });
  let symbols = [...TICKERS] as string[];
  let fragPerToken = 1_000_000;
  try {
    const [syms, fpt] = await Promise.all([
      Promise.all(dep.stocks.map((a) => client.readContract({ address: a as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => null))),
      client.readContract({ address: dep.fragments, abi: stockFragmentsAbi, functionName: "fragPerToken" }).catch(() => null),
    ]);
    symbols = syms.map((s, i) => (typeof s === "string" && s ? s : symbols[i] ?? `Stock ${i + 1}`));
    if (typeof fpt === "bigint" && fpt > 0n) fragPerToken = Number(fpt);
  } catch {
    /* fall back to the defaults */
  }
  cache = { at: Date.now(), symbols, fragPerToken, blocks: dep.stocks.length };
  return cache;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const raw = id.replace(/\.json$/, "");
  if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(raw)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const idx = Number(BigInt(raw));
  const info = await seasonInfo();
  const blocks = info?.blocks ?? TICKERS.length;
  if (!Number.isInteger(idx) || idx < 0 || idx >= blocks) return NextResponse.json({ error: "unknown fragment id" }, { status: 404 });
  const ticker = info?.symbols[idx] ?? TICKERS[idx];
  const fragPerToken = info?.fragPerToken ?? 1_000_000;
  return NextResponse.json({
    name: `${ticker} fragment`,
    description: `1/${fragPerToken.toLocaleString("en-US")} of one ${ticker} Stock Token, mined in block ${idx + 1} of a Stock Miner mine. Non-transferable; redeem at the mine's vault.`,
    decimals: 0,
    properties: { block: idx + 1, ticker, fragPerToken },
  });
}
