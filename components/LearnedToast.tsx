"use client";

import { useEffect, useState } from "react";
import type { Memory } from "@/lib/types";

/**
 * The "it learned something" moment.
 *
 * Appears over the memory column so the eye travels to the new memory
 * landing in the list behind it.
 */
export default function LearnedToast({
  learned,
  onDone,
}: {
  learned: Memory[] | null;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!learned) return;
    setLeaving(false);
    const out = setTimeout(() => setLeaving(true), 4600);
    const done = setTimeout(onDone, 5000);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [learned, onDone]);

  if (!learned || learned.length === 0) return null;

  return (
    <div
      className={`pointer-events-none fixed bottom-7 right-7 z-50 w-[300px] ${
        leaving ? "animate-toast-out" : "animate-toast-in"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-memory-line bg-surface p-4 shadow-[0_8px_28px_rgba(20,20,15,0.10)]">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-memory-soft">
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-memory"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M8 1.5 9.6 5.6 13.9 6.2 10.8 9.1 11.6 13.4 8 11.3 4.4 13.4 5.2 9.1 2.1 6.2 6.4 5.6Z" />
            </svg>
          </span>
          <span className="text-[12.5px] font-medium text-ink">
            CFO learned something
          </span>
        </div>

        <ul className="mt-2.5 space-y-1">
          {learned.map((m) => (
            <li key={m.id} className="text-[13px] leading-snug text-ink-soft">
              &ldquo;{m.text}.&rdquo;
            </li>
          ))}
        </ul>

        <p className="mt-2.5 text-[10.5px] text-ink-faint">
          Saved to EverOS · available in every future conversation
        </p>
      </div>
    </div>
  );
}
