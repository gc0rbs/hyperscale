import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { getDeployment } from "@/lib/deployment";
import { seasonMineAbi, TICKERS } from "@/lib/contracts";

/**
 * Share card (design brief §2: tick bar as the signature device). Rendered on request from the
 * season's live state, so a link pasted mid-season shows the block that is mining; falls back to the
 * static card when there is no deployment or the RPC does not answer within 1.5 s.
 */
export const runtime = "nodejs";
export const alt = "Hyperscale: four jobs, one cluster, shuts down forever";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#171512";
const FG = "#EDE9E1";
const MUTED = "#9A948A";
const SIGNAL = "#45C4DB";
const EMBER = "#F2A93B";

interface Live { phase: number; shift: number; totalHash: bigint; closeX: bigint; spb: number; blocks: number }

async function readLive(): Promise<Live | null> {
  const dep = getDeployment();
  if (!dep) return null;
  const client = createPublicClient({ transport: http(dep.rpcUrl, { timeout: 1500 }) });
  const read = (functionName: string) => client.readContract({ address: dep.mine, abi: seasonMineAbi, functionName });
  try {
    const [phase, shift, totalHash, closeX, params] = (await Promise.all([read("phase"), read("shift"), read("totalHash"), read("closeX"), read("params")])) as [number, number, bigint, bigint, { shiftsPerBlock: number; blocks: number }];
    return { phase: Number(phase), shift: Number(shift), totalHash, closeX, spb: Number(params.shiftsPerBlock), blocks: Number(params.blocks) };
  } catch {
    return null;
  }
}

function status(l: Live | null): { headline: string; sub: string; ticks: number; done: boolean } {
  if (!l) return { headline: "Four blocks. One mine.", sub: "Closes forever.", ticks: 0, done: false };
  const closed = l.closeX !== 0n || l.phase === 3;
  const cur = Math.min(Math.floor(l.shift / l.spb), l.blocks - 1);
  const ticks = closed ? 8 : Math.round(((l.shift % l.spb) / l.spb) * 8);
  const hash = Number(l.totalHash / 10n ** 15n) / 1000;
  if (l.phase === 1) return { headline: "The mine opens soon", sub: `Stake RIG, run rigs, mine ${TICKERS.join(" · ")}`, ticks: 0, done: false };
  if (closed) return { headline: "This mine has closed", sub: "Redemption is open. Fragments become Stock Tokens.", ticks: 8, done: true };
  if (l.phase === 4) return { headline: "Season cancelled", sub: "Deposits are being returned.", ticks: 0, done: true };
  return { headline: `Block ${cur + 1} is mining · ${TICKERS[cur]}`, sub: `${hash.toFixed(1)}k total hash · shift ${l.shift + 1} of ${l.spb * l.blocks}`, ticks, done: false };
}

export default async function Image() {
  const [font, live] = await Promise.all([readFile(join(process.cwd(), "src", "fonts", "humane", "Humane-Bold.ttf")), readLive()]);
  const s = status(live);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: BG, color: FG, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", fontFamily: "Humane" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 44, height: 44, border: `3px solid ${EMBER}`, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(45deg)" }}><div style={{ width: 14, height: 14, background: EMBER }} /></div>
            <div style={{ fontSize: 64, letterSpacing: 2, textTransform: "uppercase" }}>Hyperscale</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {TICKERS.map((t) => <div key={t} style={{ fontSize: 40, color: MUTED, border: `2px solid #2a2622`, padding: "2px 16px", textTransform: "uppercase" }}>{t}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 200, lineHeight: 0.85, textTransform: "uppercase", color: s.done ? MUTED : FG }}>{s.headline}</div>
          <div style={{ fontSize: 54, color: s.done ? MUTED : SIGNAL, textTransform: "uppercase", letterSpacing: 1 }}>{s.sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ width: 118, height: 18, background: i < s.ticks ? SIGNAL : "#2a2622", borderRadius: 2, ...(i === s.ticks - 1 && !s.done ? { boxShadow: `0 0 0 3px ${FG}` } : {}) }} />
          ))}
          <div style={{ marginLeft: "auto", fontSize: 34, color: MUTED, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: 24 }}>Robinhood Chain</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Humane", data: font, weight: 700, style: "normal" }] },
  );
}
