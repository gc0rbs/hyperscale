import { NextResponse } from "next/server";

/** Railway health check target (railway/app.json). No chain calls: liveness only. */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
