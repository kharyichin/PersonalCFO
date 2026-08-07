import { NextResponse } from "next/server";
import { rememberTurn } from "@/lib/everos";
import {
  addMemory,
  getMemories,
  markExtracted,
  removeMemory,
  resetMemories,
} from "@/lib/memory-store";
import { extractMemory } from "@/lib/cfo/memory-extract";
import { loadDashboard } from "@/lib/finance/source";
import type { MemoryRequest } from "@/lib/types";

/** GET /api/memory?user_id=demo_user — what the CFO remembers. */
export async function GET(request: Request) {
  const userId =
    new URL(request.url).searchParams.get("user_id") ?? "demo_user";
  return NextResponse.json({ memories: getMemories(userId) });
}

/** POST /api/memory — teach the CFO something directly. */
export async function POST(request: Request) {
  const body = (await request.json()) as MemoryRequest;
  const userId = body.user_id ?? "demo_user";
  const text = (body.memory ?? "").trim();

  if (!text) {
    return NextResponse.json({ error: "memory is required" }, { status: 400 });
  }

  const dashboard = await loadDashboard();
  const parsed = extractMemory(
    text,
    dashboard.top_categories.map((c) => c.name)
  );
  const id = `mem-${Date.now()}`;
  const sessionId = `cfo-${userId}-${Date.now()}`;

  const memory = {
    id,
    text: parsed?.label ?? text,
    quote: text,
    source: "EverOS" as const,
    created_at: new Date().toISOString(),
    kind: parsed?.kind ?? ("general" as const),
    category: parsed?.category ?? null,
    session_id: sessionId,
    pending: true,
  };

  addMemory(userId, memory);

  // Write to EverOS in the background — the UI already has what it needs.
  void rememberTurn({
    userId,
    sessionId,
    userMessage: text,
    assistantMessage: `Noted: ${memory.text}. I'll apply this to future financial advice.`,
  }).then((ok) => {
    if (ok) markExtracted(userId, id);
  });

  return NextResponse.json({ memory, memories: getMemories(userId) });
}

/** DELETE /api/memory?user_id=…&id=…  (id=all resets the demo) */
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const userId = params.get("user_id") ?? "demo_user";
  const id = params.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const memories = id === "all" ? resetMemories(userId) : removeMemory(userId, id);
  return NextResponse.json({ memories });
}
