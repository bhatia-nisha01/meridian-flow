// Private tester-session review page. Access: /review?key=<REVIEW_KEY>
import { list } from "@vercel/blob";

export const dynamic = "force-dynamic";

interface LogRecord {
  kind: string;
  sessionId: string;
  tester: string;
  at: string;
  payload: unknown;
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!process.env.REVIEW_KEY || key !== process.env.REVIEW_KEY) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Not found.</div>;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Storage not configured yet.</div>;
  }

  const blobs = await list({ prefix: "logs/", limit: 1000 });
  const records: LogRecord[] = [];
  await Promise.all(
    blobs.blobs.slice(-300).map(async (b) => {
      try {
        const r = await fetch(b.url);
        records.push((await r.json()) as LogRecord);
      } catch {}
    })
  );
  records.sort((a, b) => (a.at < b.at ? -1 : 1));

  const sessions = new Map<string, LogRecord[]>();
  for (const r of records) {
    if (!sessions.has(r.sessionId)) sessions.set(r.sessionId, []);
    sessions.get(r.sessionId)!.push(r);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-8 text-sm">
      <h1 className="text-xl font-bold mb-1">Meridian Flow — tester sessions</h1>
      <p className="text-slate-500 mb-6 text-xs">
        {sessions.size} session(s), {records.length} record(s). Newest activity last within each session.
      </p>
      {[...sessions.entries()].map(([sid, recs]) => (
        <div key={sid} className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="font-semibold mb-2">
            {recs.find((r) => r.tester)?.tester || "Anonymous"} <span className="text-slate-400 font-normal text-xs">· {sid} · first seen {recs[0]?.at?.slice(0, 16).replace("T", " ")}</span>
          </div>
          {recs.map((r, i) => (
            <div key={i} className="border-t border-slate-100 py-2">
              {r.kind === "intake" ? (
                <IntakeBlock payload={r.payload as { conversation: { role: string; content: string }[]; reply: { assistantMessage?: string; intakeComplete?: boolean; requiresStaffReview?: boolean } }} at={r.at} />
              ) : (
                <ActionsBlock payload={r.payload as { actor: string; text: string }[]} at={r.at} />
              )}
            </div>
          ))}
        </div>
      ))}
      {sessions.size === 0 && <div className="text-slate-400">No sessions logged yet.</div>}
    </div>
  );
}

function IntakeBlock({ payload, at }: { payload: { conversation: { role: string; content: string }[]; reply: { assistantMessage?: string } }; at: string }) {
  const lastUser = [...(payload.conversation ?? [])].reverse().find((m) => m.role === "user");
  return (
    <div>
      <div className="text-[10px] text-slate-400">{at.slice(11, 19)} · conversation turn</div>
      <div className="mt-1"><span className="font-medium text-blue-700">Tester:</span> {lastUser?.content}</div>
      <div className="mt-0.5"><span className="font-medium text-emerald-700">Agent:</span> {payload.reply?.assistantMessage}</div>
      <details className="text-xs text-slate-500 mt-1">
        <summary className="cursor-pointer">Full extraction</summary>
        <pre className="bg-slate-50 rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(payload.reply, null, 2)}</pre>
      </details>
    </div>
  );
}

function ActionsBlock({ payload, at }: { payload: { actor: string; text: string }[]; at: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400">{at.slice(11, 19)} · actions</div>
      <ul className="text-xs text-slate-600 list-disc ml-4">
        {(payload ?? []).map((e, i) => (
          <li key={i}>
            <b>{e.actor}</b>: {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
