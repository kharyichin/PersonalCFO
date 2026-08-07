"use client";

import { useState } from "react";
import type { Memory } from "@/lib/types";

function MemoryMark({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`mt-[3px] h-3.5 w-3.5 shrink-0 transition-colors ${
        active ? "text-memory" : "text-memory/55"
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 1.5 9.6 5.6 13.9 6.2 10.8 9.1 11.6 13.4 8 11.3 4.4 13.4 5.2 9.1 2.1 6.2 6.4 5.6Z" />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function MemoryPanel({
  memories,
  recalledIds,
  onForget,
  onTeach,
}: {
  memories: Memory[];
  recalledIds: string[];
  onForget: (id: string) => void;
  /** Teach the CFO something directly, bypassing chat entirely. */
  onTeach: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await onTeach(text);
      setDraft("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between px-7 pb-5 pt-7">
        <span className="eyebrow">What your CFO remembers</span>
        <span className="rounded-full border border-memory-line bg-memory-soft px-2 py-0.5 text-[10px] font-medium tracking-wide text-memory">
          EverOS
        </span>
      </header>

      <div className="px-7 pb-5">
        {open ? (
          <form onSubmit={submit} className="animate-rise">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) submit(e);
                if (e.key === "Escape") {
                  setOpen(false);
                  setDraft("");
                }
              }}
              placeholder="e.g. I never want to hear about cutting my gym membership"
              rows={2}
              className="w-full resize-none rounded-xl border border-memory-line bg-memory-soft/40 px-3.5 py-2.5 text-[13px] leading-snug text-ink outline-none placeholder:text-ink-faint focus:border-memory"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={!draft.trim() || saving}
                className="rounded-lg bg-memory px-3 py-1.5 text-[11.5px] font-medium text-white transition-opacity disabled:opacity-30"
              >
                {saving ? "Saving…" : "Teach CFO"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDraft("");
                }}
                className="rounded-lg px-2.5 py-1.5 text-[11.5px] text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-memory-line px-3.5 py-2.5 text-left text-[12.5px] text-memory transition-colors hover:border-memory hover:bg-memory-soft/40"
          >
            <span className="text-[15px] leading-none">+</span>
            Teach your CFO something
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scroll-quiet px-7 pb-4">
        {memories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-[12.5px] leading-relaxed text-ink-faint">
            Nothing yet. Tell your CFO what matters to you — try
            <span className="text-ink-soft">
              {" "}
              &ldquo;travel is important to me, don&rsquo;t tell me to cut
              it&rdquo;
            </span>{" "}
            — and it will remember.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {memories.map((m) => {
              const active = recalledIds.includes(m.id);
              return (
                <li
                  key={m.id}
                  className={`group relative rounded-xl border bg-memory-soft/60 px-3.5 py-3 transition-colors ${
                    active ? "border-memory animate-recall" : "border-memory-line"
                  }`}
                >
                  <div className="flex gap-2.5">
                    <MemoryMark active={active} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-ink">{m.text}</p>

                      {m.quote && (
                        <p className="mt-1.5 truncate text-[11.5px] italic leading-snug text-ink-faint">
                          &ldquo;{m.quote}&rdquo;
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-memory/80">
                        {m.pending ? (
                          <span className="text-ink-faint">Saving to EverOS…</span>
                        ) : (
                          <span>Remembered · {timeAgo(m.created_at)}</span>
                        )}
                        {active && (
                          <span className="rounded-full bg-memory/12 px-1.5 py-0.5 font-medium text-memory">
                            used in this answer
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => onForget(m.id)}
                      className="absolute right-2 top-2 rounded-md p-1 text-ink-faint opacity-0 transition-opacity hover:text-terra group-hover:opacity-100"
                      aria-label={`Forget: ${m.text}`}
                      title="Forget this"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      >
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-line px-7 py-4">
        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          Memories persist across conversations. Start a new chat and your CFO
          still knows what matters to you.
        </p>
      </footer>
    </div>
  );
}
