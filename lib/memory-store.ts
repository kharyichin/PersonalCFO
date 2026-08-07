import type { Memory } from "@/lib/types";

/**
 * A thin server-side index of what we've taught EverOS.
 *
 * EverOS is the source of truth for memory, but it stores rich narrative
 * episodes, not the short labels this UI shows. So we keep the label, the
 * user's original wording, and the EverOS session id side by side — the
 * session id is what lets us tell which of these EverOS actually recalled
 * for a given question.
 *
 * Module-level state is intentional: it survives between requests in a single
 * dev/demo process and needs no database. Swap for a real store post-hackathon.
 */

export type StoredMemory = Memory & {
  /** EverOS session this memory was written under. */
  session_id: string;
};

const store = new Map<string, StoredMemory[]>();

/** One seeded memory so the panel is never empty on first load. The
 *  interesting ones get taught live during the demo. */
const SEED: Omit<StoredMemory, "created_at">[] = [
  {
    id: "seed-goal",
    text: "Saving toward a large purchase",
    quote: "I'm putting money aside for something big this year.",
    source: "EverOS",
    kind: "goal",
    category: null,
    session_id: "seed",
  },
];

export function getMemories(userId: string): StoredMemory[] {
  if (!store.has(userId)) {
    store.set(
      userId,
      SEED.map((m) => ({ ...m, created_at: new Date().toISOString() }))
    );
  }
  return store.get(userId)!;
}

export function addMemory(userId: string, memory: StoredMemory): StoredMemory[] {
  const list = getMemories(userId);
  // Don't stack duplicates when a demo is run twice.
  if (!list.some((m) => m.text.toLowerCase() === memory.text.toLowerCase())) {
    list.unshift(memory);
  }
  return list;
}

export function markExtracted(userId: string, id: string) {
  const m = getMemories(userId).find((x) => x.id === id);
  if (m) m.pending = false;
}

export function removeMemory(userId: string, id: string): StoredMemory[] {
  const list = getMemories(userId).filter((m) => m.id !== id);
  store.set(userId, list);
  return list;
}

/** Wipes everything — used by the "Reset demo" control. */
export function resetMemories(userId: string) {
  store.delete(userId);
  return getMemories(userId);
}
