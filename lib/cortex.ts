/**
 * Cortex Agent — real transaction-level reasoning, on demand.
 *
 * Cortex digs into actual merchant-level detail (currency conversions,
 * specific line items) that the fast local engine (lib/cfo/engine.ts)
 * can't see — but it took ~40s to answer in testing. Too slow to be the
 * default for every chat message, so the main /api/ask flow never calls
 * this automatically regardless of whether CORTEX_URL is set. It's only
 * invoked by the explicit "Ask Cortex for a deeper answer" action
 * (deep_dive: true on the request) — see app/api/ask/route.ts.
 *
 * Contract: POST CORTEX_URL with CortexRequest, expect CortexAnswer back.
 */

import type { Category, Memory } from "@/lib/types";

const CORTEX_URL = process.env.CORTEX_URL;
/** Generous — this is a deliberate, user-triggered wait, not the hot path. */
const DEEP_DIVE_TIMEOUT_MS = 70_000;

export const cortexConfigured = Boolean(CORTEX_URL);

export type CortexRequest = {
  user_id: string;
  question: string;
  financial_context: {
    monthly_spend: number;
    average_spend: number;
    savings_rate: number;
    top_categories: Category[];
  };
  /** Everything currently in EverOS for this user — Cortex reasons over these. */
  memories: {
    id: string;
    text: string;
    quote?: string;
    kind?: string;
    category?: string | null;
  }[];
};

export type CortexAnswer = {
  answer: string;

  memories_used?: {
    id?: string;
    text: string;
    source?: string;
  }[];

  evidence?: {
    label: string;
    value: string;
    tone?: "up" | "down" | "flat";
  }[];

  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
};

export async function askCortex(req: CortexRequest): Promise<CortexAnswer | null> {
  if (!CORTEX_URL) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEP_DIVE_TIMEOUT_MS);

  try {
    const res = await fetch(CORTEX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(req),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[cortex] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as CortexAnswer & {
      // The live service actually sends `token_usage`, not `usage` — this
      // was the real reason usage numbers never showed up: the forwarding
      // code was correct, but nothing was ever there to forward. Accept
      // either name so this keeps working if the field is ever renamed to
      // match what the type originally documented.
      token_usage?: CortexAnswer["usage"];
    };
    if (!data.answer || typeof data.answer !== "string") {
      console.error("[cortex] response missing 'answer' string");
      return null;
    }
    return { ...data, usage: data.usage ?? data.token_usage };
  } catch (err) {
    console.error("[cortex] request failed or timed out:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function toCortexMemories(memories: Memory[]): CortexRequest["memories"] {
  return memories.map((m) => ({
    id: m.id,
    text: m.text,
    quote: m.quote,
    kind: m.kind,
    category: m.category,
  }));
}
