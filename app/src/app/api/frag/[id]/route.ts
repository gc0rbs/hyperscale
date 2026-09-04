import { NextResponse } from "next/server";
import { TICKERS } from "@/lib/contracts";

/** ERC-1155 metadata for fragment ids (block index). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idx = Number(id.replace(/\.json$/, ""));
  const ticker = TICKERS[idx] ?? "?";
  return NextResponse.json({
    name: `${ticker} fragment`,
    description: `One millionth of one ${ticker} Stock Token, mined in block ${idx + 1} of a Stock Miner season. Non-transferable; redeem at the season vault.`,
    decimals: 0,
    properties: { block: idx + 1, ticker, fragPerToken: 1_000_000 },
  });
}
