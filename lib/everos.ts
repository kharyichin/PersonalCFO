/**
 * EverOS — the persistent memory layer.
 *
 * Server-side only. The API key lives in .env.local and never reaches the
 * browser, which is why every call here goes through our own /api routes.
 *
 * Docs: https://docs.evermind.ai
 */

const BASE = process.env.EVEROS_BASE_URL ?? "https://api.evermind.ai";
const KEY = process.env.EVEROS_API_KEY;

export const everosConfigured = Boolean(KEY);

type EverosEpisode = {
  id: string;
  session_id?: string;
  timestamp?: string;
  summary?: string;
  episode?: string;
  atomic_facts?: { id: string; content: string }[];
  score?: number;
};

async function everos<T>(path: string, body: unknown): Promise<T | null> {
  if (!KEY) return null;
  try {
    const res = await fetch(`${BASE}/api/v2/memory/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[everos] ${path} -> HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return json.data as T;
  } catch (err) {
    // Never let a memory-service hiccup take down the demo.
    console.error(`[everos] ${path} failed:`, err);
    return null;
  }
}

/**
 * Persist a conversation turn, then force extraction.
 *
 * `add` alone only accumulates messages ("accumulated"); `flush` is what turns
 * them into a searchable memory ("extracted"). Together they take ~5s, so
 * callers should not block the UI on this — fire it in the background.
 */
export async function rememberTurn(opts: {
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<boolean> {
  const now = Date.now();
  const added = await everos<{ status: string }>("add", {
    session_id: opts.sessionId,
    messages: [
      {
        sender_id: opts.userId,
        role: "user",
        timestamp: now,
        content: opts.userMessage,
      },
      {
        sender_id: "assistant",
        role: "assistant",
        timestamp: now + 1,
        content: opts.assistantMessage,
      },
    ],
    async_mode: false,
  });
  if (!added) return false;

  const flushed = await everos<{ status: string }>("flush", {
    session_id: opts.sessionId,
  });
  return flushed?.status === "extracted";
}

/** Retrieve the memories most relevant to a question. ~300ms. */
export async function recallMemories(opts: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<EverosEpisode[]> {
  const data = await everos<{ episodes: EverosEpisode[] }>("search", {
    query: opts.query,
    user_id: opts.userId,
    method: "hybrid",
    top_k: opts.topK ?? 6,
    include_profile: true,
  });
  return data?.episodes ?? [];
}
