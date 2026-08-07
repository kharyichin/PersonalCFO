/**
 * Cortex Agent — the reasoning swap-in point.
 *
 * Today /api/ask answers with lib/cfo/engine.ts (deterministic, no model
 * call). When the teammate's Cortex Agent is ready, set CORTEX_URL and every
 * question routes there instead — no other file changes.
 *
 * Contract: POST CORTEX_URL with CortexRequest, expect CortexAnswer back.
 * Same shape as the local engine's output, so the frontend can't tell (and
 * doesn't need to) which one answered.
 *
 * On any failure — unset URL, timeout, non-200, malformed JSON — this
 * returns null and the caller falls back to the local engine. A demo should
 * never go blank because a teammate's service hiccuped on stage.
 */

import type { Category, Memory } from "@/lib/types";

const CORTEX_URL = process.env.CORTEX_URL;
const TIMEOUT_MS = 8000;

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
  memories_used?: { id?: string; text: string; source?: string }[];
  evidence?: { label: string; value: string; tone?: "up" | "down" | "flat" }[];
};

export async function askCortex(req: CortexRequest): Promise<CortexAnswer | null> {
  if (!CORTEX_URL) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(CORTEX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[cortex] HTTP ${res.status}, falling back to local engine`);
      return null;
    }

    const data = (await res.json()) as CortexAnswer;
    if (!data.answer || typeof data.answer !== "string") {
      console.error("[cortex] response missing 'answer' string, falling back");
      return null;
    }
    return data;
  } catch (err) {
    console.error("[cortex] request failed, falling back to local engine:", err);
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
