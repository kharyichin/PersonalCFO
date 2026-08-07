"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dashboard, Memory } from "@/lib/types";
import FinancialPanel from "./FinancialPanel";
import MemoryPanel from "./MemoryPanel";
import LearnedToast from "./LearnedToast";
import ChatPanel, { type ChatMessage } from "./ChatPanel";

const USER_ID = "demo_user";

/**
 * True above the `lg` breakpoint. Defaults to desktop so the primary demo
 * surface (a laptop) renders correctly on first paint with no layout flash —
 * only mobile visitors see a brief correction once the media query resolves.
 *
 * This exists so CFOApp renders exactly ONE layout tree, not both toggled by
 * CSS: mounting ChatPanel twice (once per layout) gave each copy its own
 * scroll ref, and whichever copy wasn't visible could still catch a
 * programmatic click, leaving the visible one never scrolled.
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function CFOApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [learned, setLearned] = useState<Memory[] | null>(null);
  const [recalledIds, setRecalledIds] = useState<string[]>([]);
  const [mobileTab, setMobileTab] = useState<"money" | "chat" | "memory">("chat");
  const isDesktop = useIsDesktop();

  // Initial load
  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setDashboard)
      .catch(() => {});
    refreshMemories();
  }, []);

  const refreshMemories = useCallback(() => {
    fetch(`/api/memory?user_id=${USER_ID}`)
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []))
      .catch(() => {});
  }, []);

  /** Briefly highlight memories in the right column. */
  const flashRecall = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setRecalledIds(ids);
    setTimeout(() => setRecalledIds([]), 4200);
  }, []);

  const send = useCallback(
    async (question: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", text: question },
      ]);
      setPending(true);

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: USER_ID, question }),
        });
        const data = await res.json();

        setMessages((prev) => [
          ...prev,
          {
            id: `c-${Date.now()}`,
            role: "cfo",
            text: data.answer ?? "Something went wrong on my end.",
            evidence: data.evidence,
            memories_used: data.memories_used,
            lookup: data.memory_lookup ?? null,
          },
        ]);

        // Taught the CFO something new
        if (data.learned_all?.length) {
          setMemories(data.learned_all.concat(memories));
          setLearned(data.learned_all);
          flashRecall(data.learned_all.map((m: Memory) => m.id));
          // Pick up the "saved to EverOS" state once extraction finishes.
          setTimeout(refreshMemories, 6000);
        }

        // Used existing memories to answer
        const usedIds = (data.memories_used ?? [])
          .map((m: { id?: string }) => m.id)
          .filter(Boolean) as string[];
        if (usedIds.length) flashRecall(usedIds);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "cfo",
            text: "I couldn't reach your data just then. Try that again?",
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [memories, flashRecall, refreshMemories]
  );

  const forget = useCallback(async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/memory?user_id=${USER_ID}&id=${id}`, { method: "DELETE" });
  }, []);

  /** Teach the CFO directly from the memory panel, bypassing chat. */
  const teach = useCallback(
    async (text: string) => {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: USER_ID, memory: text }),
      });
      const data = await res.json();
      if (data.memory) {
        setMemories((prev) => [data.memory, ...prev]);
        setLearned([data.memory]);
        flashRecall([data.memory.id]);
        setTimeout(refreshMemories, 6000);
      }
    },
    [flashRecall, refreshMemories]
  );

  return (
    <div className="flex h-screen flex-col">
      {isDesktop ? (
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-[310px] shrink-0 border-r border-line">
            <FinancialPanel data={dashboard} />
          </aside>

          <main className="min-w-0 flex-1 bg-surface">
            <ChatPanel
              messages={messages}
              pending={pending}
              onSend={send}
              onNewConversation={() => setMessages([])}
              memoryCount={memories.length}
            />
          </main>

          <aside className="hidden w-[330px] shrink-0 border-l border-line xl:block">
            <MemoryPanel
              memories={memories}
              recalledIds={recalledIds}
              onForget={forget}
              onTeach={teach}
            />
          </aside>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {mobileTab === "money" && <FinancialPanel data={dashboard} />}
            {mobileTab === "chat" && (
              <ChatPanel
                messages={messages}
                pending={pending}
                onSend={send}
                onNewConversation={() => setMessages([])}
                memoryCount={memories.length}
              />
            )}
            {mobileTab === "memory" && (
              <MemoryPanel
                memories={memories}
                recalledIds={recalledIds}
                onForget={forget}
                onTeach={teach}
              />
            )}
          </div>
          <nav className="flex border-t border-line bg-surface">
            {(
              [
                ["money", "Money"],
                ["chat", "CFO"],
                ["memory", `Memory${memories.length ? ` · ${memories.length}` : ""}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMobileTab(key)}
                className={`flex-1 py-3.5 text-[12px] transition-colors ${
                  mobileTab === key
                    ? "font-medium text-ink"
                    : "text-ink-faint hover:text-ink-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}

      <LearnedToast learned={learned} onDone={() => setLearned(null)} />
    </div>
  );
}
