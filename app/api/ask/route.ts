import { NextResponse } from "next/server";
import { everosConfigured, recallMemories, rememberTurn } from "@/lib/everos";
import { addMemory, getMemories, markExtracted } from "@/lib/memory-store";
import { extractAll } from "@/lib/cfo/memory-extract";
import { acknowledgeMemory, answerQuestion, financialContext } from "@/lib/cfo/engine";
import { askCortex, cortexConfigured, toCortexMemories } from "@/lib/cortex";
import { loadDashboard } from "@/lib/finance/source";
import type { AskRequest, AskResponse } from "@/lib/types";

/**
 * POST /api/ask
 *
 * Three paths:
 *  1. The user told us something  -> store it in EverOS, confirm we learned it.
 *  2. deep_dive: true             -> real Cortex Agent analysis. Slow (~40s
 *                                     observed), so this only runs when
 *                                     explicitly requested — never the
 *                                     default chat path — and doesn't fall
 *                                     back to the local engine on failure,
 *                                     since silently substituting a
 *                                     template answer for a request the
 *                                     user made specifically to see Cortex
 *                                     would be misleading.
 *  3. Anything else               -> instant answer from the local engine,
 *                                     informed by EverOS-recalled memories.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as AskRequest & { deep_dive?: boolean };
  const userId = body.user_id ?? "demo_user";
  const question = (body.question ?? "").trim();
  const deepDive = body.deep_dive === true;

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const dashboard = await loadDashboard();

  // ---- Path 2: explicit Cortex deep dive ---------------------------------
  if (deepDive) {
    if (!cortexConfigured) {
      return NextResponse.json(
        { error: "cortex_not_configured" },
        { status: 503 }
      );
    }

    const stored = getMemories(userId);
    const started = Date.now();
    const episodes = everosConfigured
      ? await recallMemories({ userId, query: question, topK: 6 })
      : [];
    const recalledSessions = new Set(
      episodes.map((e) => e.session_id).filter(Boolean) as string[]
    );

    const cortexAnswer = await askCortex({
      user_id: userId,
      question,
      financial_context: {
        monthly_spend: dashboard.monthly_spend,
        average_spend: dashboard.average_spend,
        savings_rate: dashboard.savings_rate,
        top_categories: dashboard.top_categories,
      },
      memories: toCortexMemories(stored),
    });

    if (!cortexAnswer) {
      return NextResponse.json(
        { error: "cortex_unavailable" },
        { status: 503 }
      );
    }

    const memories_used = (cortexAnswer.memories_used ?? []).map((m) => {
      const match = stored.find((s) => s.id === m.id);
      return {
        ...m,
        recalled_by_everos: match ? recalledSessions.has(match.session_id) : false,
      };
    });

    void rememberTurn({
      userId,
      sessionId: `cfo-${userId}-chat`,
      userMessage: question,
      assistantMessage: cortexAnswer.answer,
    });

    return NextResponse.json({
  answer: cortexAnswer.answer,
  memories_used,
  evidence: cortexAnswer.evidence,

  usage: cortexAnswer.usage,

  financial_context: financialContext(dashboard),

  memory_lookup: {
    source: "EverOS",
    configured: everosConfigured,
    recalled: recalledSessions.size,
    ms: Date.now() - started,
  },

  answered_by: "cortex",
});
  }

  // ---- Path 1: this message teaches the CFO something -------------------
  const learned = extractAll(
    question,
    dashboard.top_categories.map((c) => c.name)
  );
  if (learned.length > 0) {
    const sessionId = `cfo-${userId}-${Date.now()}`;
    const created = learned.map((l, i) => ({
      id: `mem-${Date.now()}-${i}`,
      text: l.label,
      quote: l.quote,
      source: "EverOS" as const,
      created_at: new Date().toISOString(),
      kind: l.kind,
      category: l.category,
      session_id: sessionId,
      pending: true,
    }));

    // Each add pushes to the front, so insert backwards to keep the list in
    // the order the user actually said things.
    [...created].reverse().forEach((m) => addMemory(userId, m));

    const answer = acknowledgeMemory(created.map((c) => c.text));

    // Persist to EverOS without making the user wait ~5s for extraction.
    void rememberTurn({
      userId,
      sessionId,
      userMessage: question,
      assistantMessage: answer,
    }).then((ok) => {
      if (ok) created.forEach((c) => markExtracted(userId, c.id));
    });

    const payload: AskResponse & { learned_all?: typeof created } = {
      answer,
      memories_used: [],
      financial_context: financialContext(dashboard),
      learned: created[0],
      learned_all: created,
    };
    return NextResponse.json(payload);
  }

  // ---- Path 3: instant answer from the local engine ----------------------
  const stored = getMemories(userId);

  // Ask EverOS which memories matter for *this* question.
  let recalledSessions = new Set<string>();
  let lookupMs = 0;
  if (everosConfigured) {
    const started = Date.now();
    const episodes = await recallMemories({ userId, query: question, topK: 6 });
    lookupMs = Date.now() - started;
    recalledSessions = new Set(
      episodes.map((e) => e.session_id).filter(Boolean) as string[]
    );
  }

  const response = answerQuestion(question, dashboard, stored);

  // Flag which cited memories EverOS independently surfaced for this query.
  const memories_used = response.memories_used.map((m) => {
    const match = stored.find((s) => s.id === m.id);
    return {
      ...m,
      recalled_by_everos: match ? recalledSessions.has(match.session_id) : false,
    };
  });

  void rememberTurn({
    userId,
    sessionId: `cfo-${userId}-chat`,
    userMessage: question,
    assistantMessage: response.answer,
  });

  return NextResponse.json({
    ...response,
    memories_used,
    memory_lookup: {
      source: "EverOS",
      configured: everosConfigured,
      recalled: recalledSessions.size,
      ms: lookupMs,
    },
    answered_by: "local",
    cortex_available: cortexConfigured,
  });
}
