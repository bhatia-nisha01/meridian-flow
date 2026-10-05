// Server-side logging to Vercel Blob (best-effort — never blocks the user).
import { put } from "@vercel/blob";

export async function logBlob(kind: string, sessionId: string, payload: unknown) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await put(
      `logs/${sessionId}/${ts}-${kind}.json`,
      JSON.stringify({ kind, sessionId, at: new Date().toISOString(), payload }, null, 2),
      { access: "public", addRandomSuffix: true, contentType: "application/json" }
    );
  } catch {
    // logging must never break the product
  }
}
