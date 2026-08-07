"use client";

import { useEffect, useRef, useState } from "react";
import Tooltip from "./ui/Tooltip";

export type ChatMessage = {
  id: string;
  role: "user" | "cfo" | "cortex" | "cortex-error";
  text: string;
  evidence?: { label: string; value: string; tone?: "up" | "down" | "flat" }[];
  memories_used?: { id?: string; text: string; recalled_by_everos?: boolean }[];
  lookup?: { recalled: number; ms: number } | null;
  /** The question this answered — needed to re-ask Cortex for a deep dive. */
  question?: string;
  /** Only meaningful on "cfo" messages: is Cortex configured to try? */
  cortexAvailable?: boolean;
};

const SUGGESTIONS = [
  "Why was I spending more this month?",
  "What should I cut?",
  "Can I afford a $1,500 laptop?",
  "What's unusual about my spending?",
];

/**
 * Shown while the CFO barely knows the user.
 *
 * This is the alternative to an onboarding questionnaire: rather than a form,
 * the CFO asks for context the way an advisor would, and the answer becomes a
 * memory. One click and the judge sees the whole loop.
 */
const TEACH_PROMPT =
  "Travel is important to me. Don't tell me to cut travel — I'd rather reduce unnecessary food delivery.";

/** Minimal **bold** support — the engine uses it sparingly for emphasis. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((para, i) => (
        <p key={i} className={i > 0 ? "mt-3.5" : undefined}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith("**") && chunk.endsWith("**") ? (
              <strong key={j} className="font-medium text-ink">
                {chunk.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{chunk}</span>
            )
          )}
        </p>
      ))}
    </>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5 text-[12.5px] text-ink-faint">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 w-1 rounded-full bg-memory"
            style={{
              animation: "dot-pulse 1.1s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </span>
      Checking your memory and this month&rsquo;s numbers…
    </div>
  );
}

export default function ChatPanel({
  messages,
  pending,
  onSend,
  onNewConversation,
  memoryCount = 0,
  onDeepDive,
  deepDivingId,
}: {
  messages: ChatMessage[];
  pending: boolean;
  onSend: (q: string) => void;
  onNewConversation: () => void;
  /** Drives whether the CFO asks for context first. */
  memoryCount?: number;
  /** Ask the real Cortex Agent to re-analyze a given answer — slow (~40s),
   *  so it's opt-in per message rather than automatic. */
  onDeepDive?: (messageId: string, question: string) => void;
  /** Message id currently waiting on a Cortex response, if any. */
  deepDivingId?: string | null;
}) {
  const [value, setValue] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Instant, not smooth: smooth-scroll animations are unreliable across
    // browsers (can get dropped or undershoot) — not a risk worth taking on
    // the one interaction that has to land every time during a demo.
    // evidence/memories_used arrive on the message object itself (not a
    // later fetch), so DOM layout for the full message is already committed
    // by the time this effect runs — no need to defer to a later frame.
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, pending]);

  function submit(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    onSend(q);
    setValue("");
    inputRef.current?.focus();
  }

  const empty = messages.length === 0;
  // One seeded memory doesn't count as knowing someone.
  const needsContext = memoryCount <= 1;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="shrink-0 font-serif text-[19px] leading-none">Personal CFO</h1>
          <span className="hidden truncate text-[11.5px] text-ink-faint sm:inline">
            Knows what you spent. Remembers what matters.
          </span>
        </div>
        {!empty && (
          <button
            onClick={onNewConversation}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
            title="Clears the chat. Your CFO keeps its memories."
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New conversation</span>
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto scroll-quiet px-4 py-6 sm:px-8 sm:py-7">
        {empty ? (
          <div className="mx-auto flex h-full max-w-[560px] flex-col justify-center">
            <div className="animate-rise">
              <p className="font-serif text-[27px] leading-snug tracking-tight">
                I&rsquo;ve been through this month&rsquo;s spending.
              </p>
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink-soft">
                {needsContext
                  ? "Before I start suggesting things — is there anything you'd rather I didn't touch? Tell me, and I'll remember it for good."
                  : "Ask me anything about your money. I'll factor in everything you've told me matters."}
              </p>
            </div>

            {needsContext && (
              <button
                onClick={() => submit(TEACH_PROMPT)}
                className="mt-7 flex items-start gap-2.5 rounded-xl border border-memory-line bg-memory-soft/60 px-4 py-3.5 text-left transition-colors hover:border-memory animate-rise"
                style={{ animationDelay: "100ms" }}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 text-memory"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M8 1.5 9.6 5.6 13.9 6.2 10.8 9.1 11.6 13.4 8 11.3 4.4 13.4 5.2 9.1 2.1 6.2 6.4 5.6Z" />
                </svg>
                <span>
                  <span className="block text-[13.5px] leading-snug text-ink">
                    &ldquo;{TEACH_PROMPT}&rdquo;
                  </span>
                  <span className="mt-1 block text-[11.5px] text-memory">
                    Tell your CFO this — it will remember
                  </span>
                </span>
              </button>
            )}

            <div
              className="mt-4 grid gap-2 animate-rise"
              style={{ animationDelay: "120ms" }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="group flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-left text-[13.5px] text-ink transition-all hover:border-ink-faint hover:shadow-[0_1px_3px_rgba(20,20,15,0.05)]"
                >
                  {s}
                  <span className="text-ink-faint transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[620px] space-y-7">
            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end animate-rise">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-sunk px-4 py-2.5 text-[14px] leading-relaxed text-ink">
                      {m.text}
                    </div>
                  </div>
                );
              }

              if (m.role === "cortex-error") {
                return (
                  <div
                    key={m.id}
                    className="animate-rise rounded-xl border border-terra/25 bg-terra-soft px-4 py-3 text-[13px] leading-relaxed text-ink"
                  >
                    {m.text}
                  </div>
                );
              }

              const isCortex = m.role === "cortex";
              const isDeepDiving = deepDivingId === m.id;

              return (
                <div key={m.id} className="animate-rise">
                  <div className="mb-2.5 flex items-center gap-2">
                    {isCortex ? (
                      <>
                        <span className="eyebrow text-green">Cortex Agent</span>
                        <Tooltip content="Real analysis over your actual transactions — not the fast template answer above.">
                          <span className="cursor-help rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-medium text-green">
                            deep dive
                          </span>
                        </Tooltip>
                      </>
                    ) : (
                      <>
                        <span className="eyebrow">Your CFO</span>
                        {m.lookup && m.lookup.recalled > 0 && (
                          <Tooltip content="A live EverOS search for this exact question — not scripted.">
                            <span className="cursor-help rounded-full bg-memory-soft px-2 py-0.5 text-[10px] font-medium text-memory">
                              recalled {m.lookup.recalled} from EverOS · {m.lookup.ms}ms
                            </span>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </div>

                  <div
                    className={
                      isCortex
                        ? "rounded-xl border border-green-line bg-green-soft/40 p-4 text-[14px] leading-[1.65] text-ink"
                        : "text-[14.5px] leading-[1.65] text-ink-soft"
                    }
                  >
                    <RichText text={m.text} />
                  </div>

                  {m.evidence && m.evidence.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {m.evidence.map((e) => (
                        <div
                          key={e.label}
                          className="rounded-lg border border-line bg-surface px-3 py-2"
                        >
                          <div className="text-[10.5px] text-ink-faint">
                            {e.label}
                          </div>
                          <div
                            className={`tnum mt-0.5 text-[13px] font-medium ${
                              e.tone === "up"
                                ? "text-terra"
                                : e.tone === "down"
                                  ? "text-green"
                                  : "text-ink"
                            }`}
                          >
                            {e.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {m.memories_used && m.memories_used.length > 0 && (
                    <div className="mt-4 rounded-xl border border-memory-line bg-memory-soft/50 px-4 py-3">
                      <div className="eyebrow text-memory">Personalised using</div>
                      <ul className="mt-2 space-y-1.5">
                        {m.memories_used.map((mem, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-[12.5px] leading-snug text-ink"
                          >
                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-memory" />
                            {mem.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!isCortex && m.cortexAvailable && m.question && onDeepDive && (
                    <div className="mt-3.5">
                      {isDeepDiving ? (
                        <div className="flex items-center gap-2.5 text-[12px] text-green">
                          <span className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="h-1 w-1 rounded-full bg-green"
                                style={{
                                  animation: "dot-pulse 1.1s ease-in-out infinite",
                                  animationDelay: `${i * 0.15}s`,
                                }}
                              />
                            ))}
                          </span>
                          Cortex is digging into your actual transactions — this takes under a minute…
                        </div>
                      ) : (
                        <button
                          onClick={() => onDeepDive(m.id, m.question!)}
                          className="text-[12px] font-medium text-green underline decoration-green/30 underline-offset-2 hover:decoration-green"
                        >
                          Ask Cortex for a deeper answer →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {pending && <Thinking />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="border-t border-line px-8 py-5">
        <div className="mx-auto max-w-[620px]">
          {!empty && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  disabled={pending}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(value);
            }}
            className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 transition-colors focus-within:border-ink-faint"
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask your CFO, or tell it what matters to you…"
              className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!value.trim() || pending}
              className="rounded-xl bg-green px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity disabled:opacity-25"
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
