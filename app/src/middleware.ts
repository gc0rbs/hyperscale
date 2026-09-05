import { NextResponse, type NextRequest } from "next/server";

/**
 * Geo-fence (docs/07 §1, §5). Robinhood Stock Tokens are not for persons in the US, Canada, the UK or
 * Switzerland; the restriction is legal, not on-chain, so the front-end enforces it. Uses the edge
 * country header (Vercel `x-vercel-ip-country`, Cloudflare `cf-ipcountry`). On by default in production;
 * set NEXT_PUBLIC_GEOFENCE=0 to disable (local dev, testnet rehearsals) or NEXT_PUBLIC_GEOFENCE=1 to force.
 */
const BLOCKED = new Set((process.env.GEOFENCE_COUNTRIES ?? "US,CA,GB,CH").split(",").map((s) => s.trim().toUpperCase()));

function enabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_GEOFENCE;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV === "production";
}

export function middleware(req: NextRequest) {
  if (!enabled()) return NextResponse.next();
  const country = (req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? "").toUpperCase();
  if (country && BLOCKED.has(country)) {
    const url = req.nextUrl.clone();
    url.pathname = "/restricted";
    url.search = "";
    return NextResponse.rewrite(url, { status: 451 });
  }
  return NextResponse.next();
}

export const config = {
  // everything except the restricted page itself, API routes, Next internals and static files
  matcher: ["/((?!restricted|api|_next|favicon.ico|icon.svg|art/).*)"],
};
