import { NextRequest, NextResponse } from "next/server";
import { logBlob } from "@/lib/logging";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, events } = await req.json();
    if (!sessionId || !Array.isArray(events) || events.length === 0) return NextResponse.json({ ok: true });
    await logBlob("actions", String(sessionId).slice(0, 40), events.slice(0, 50));
  } catch {}
  return NextResponse.json({ ok: true });
}
