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
 * Two paths:
 *  1. The user told us something -> store it in EverOS, confirm we learned it.
 *  2. The user asked something   -> recall from EverOS, answer using the
 *                                   figures *and* what we remember.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as AskRequest;
  const userId = body.user_id ?? "demo_user";
  const question = (body.question ?? "").trim();

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const dashboard = await loadDashboard();

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

  // ---- Path 2: answer, informed by memory -------------------------------
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

  // Cortex Agent, if wired up (CORTEX_URL set) — else the local engine.
  // Cortex gets the same figures and memories the local engine uses, so
  // switching between them is invisible to the frontend.
  const cortexAnswer = cortexConfigured
    ? await askCortex({
        user_id: userId,
        question,
        financial_context: {
          monthly_spend: dashboard.monthly_spend,
          average_spend: dashboard.average_spend,
          savings_rate: dashboard.savings_rate,
          top_categories: dashboard.top_categories,
        },
        memories: toCortexMemories(stored),
      })
    : null;

  const response = cortexAnswer
    ? {
        answer: cortexAnswer.answer,
        memories_used: cortexAnswer.memories_used ?? [],
        evidence: cortexAnswer.evidence,
        financial_context: financialContext(dashboard),
      }
    : answerQuestion(question, dashboard, stored);

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
    answered_by: cortexAnswer ? "cortex" : "local",
  });
}
