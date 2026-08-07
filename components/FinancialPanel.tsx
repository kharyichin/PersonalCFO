"use client";

import { useEffect, useRef, useState } from "react";
import type { Dashboard } from "@/lib/types";
import { money, pctChange } from "@/lib/finance/data";
import Tooltip from "./ui/Tooltip";

/** Counts up once on mount. One small flourish, not a light show. */
function useCountUp(target: number, duration = 750) {
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !target) return;
    done.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

function Stat({
  value,
  label,
  tone = "neutral",
}: {
  value: string;
  label: string;
  tone?: "neutral" | "up" | "good";
}) {
  const color =
    tone === "up" ? "text-terra" : tone === "good" ? "text-green" : "text-ink";
  return (
    <div>
      <div className={`tnum text-[22px] leading-none font-medium ${color}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[12px] leading-snug text-ink-faint">{label}</div>
    </div>
  );
}

export default function FinancialPanel({ data }: { data: Dashboard | null }) {
  const spend = useCountUp(data?.monthly_spend ?? 0);

  if (!data) {
    return (
      <div className="space-y-3 p-7">
        <div className="h-3 w-24 rounded bg-sunk" />
        <div className="h-12 w-40 rounded bg-sunk" />
        <div className="h-3 w-32 rounded bg-sunk" />
      </div>
    );
  }

  const delta = data.monthly_spend - data.average_spend;
  const deltaPct = pctChange(data.monthly_spend, data.average_spend);
  const max = Math.max(...data.top_categories.map((c) => c.amount));
  const categories = data.top_categories.slice(0, 4);

  // The most interesting category is the one furthest from normal, not the
  // biggest — housing is always biggest and never worth mentioning. "Other" is
  // excluded too: a catch-all bucket swinging is noise, not an insight.
  const notable = [...data.top_categories]
    .filter((c) => c.name !== "Other" && c.amount - c.normal >= 15)
    .sort((a, b) => pctChange(b.amount, b.normal) - pctChange(a.amount, a.normal))[0];
  const notablePct = notable ? pctChange(notable.amount, notable.normal) : 0;
  const notableDiff = notable ? notable.amount - notable.normal : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between px-7 pb-3 pt-5">
        <span className="eyebrow">Your money</span>
        <Tooltip content="Live data from Snowflake — not typed in." align="right">

          <span className="cursor-help rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-faint">
            Snowflake
          </span>
        </Tooltip>
      </header>

      <div className="flex-1 overflow-y-auto scroll-quiet px-7 pb-4">
        {/* Hero figure */}
        <div className="animate-rise">
          <div className="text-[12px] text-ink-faint">{data.month_label ?? "This month"}</div>
          <div className="tnum mt-1 font-serif text-[40px] leading-[1.05] tracking-tight">
            {money(spend)}
          </div>
          <div className="mt-1 text-[13px] text-ink-soft">Total spending</div>
        </div>

        <div
          className="mt-4 grid grid-cols-2 gap-5 border-t border-line pt-4 animate-rise"
          style={{ animationDelay: "80ms" }}
        >
          <Stat
            value={`${deltaPct >= 0 ? "+" : "−"}${Math.abs(deltaPct)}%`}
            label={`vs your normal · ${money(data.average_spend)}`}
            tone={deltaPct > 0 ? "up" : "good"}
          />
          <Stat value={`${data.savings_rate}%`} label="Savings rate" tone="good" />
        </div>

        {/* Categories */}
        <div
          className="mt-5 animate-rise"
          style={{ animationDelay: "160ms" }}
        >
          <div className="eyebrow mb-2">Where it went</div>
          <ul className="space-y-2">
            {categories.map((c, i) => {
              const diff = c.amount - c.normal;
              const pct = pctChange(c.amount, c.normal);
              return (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-ink">{c.name}</span>
                    <span className="tnum text-[13px] text-ink-soft">
                      {money(c.amount)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-sunk">
                      <div
                        className="h-full rounded-full bg-green/70 animate-sweep"
                        style={{
                          width: `${(c.amount / max) * 100}%`,
                          animationDelay: `${200 + i * 60}ms`,
                        }}
                      />
                    </div>
                    {Math.abs(pct) >= 5 && (
                      <span
                        className={`tnum shrink-0 text-[10.5px] ${
                          diff > 0 ? "text-terra" : "text-green"
                        }`}
                      >
                        {diff > 0 ? "+" : "−"}
                        {Math.abs(pct)}%
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Insight */}
        {notable && (
          <div
            className="mt-4 rounded-xl border border-line bg-surface p-3 animate-rise"
            style={{ animationDelay: "260ms" }}
          >
            <div className="eyebrow mb-1.5 text-terra">Worth knowing</div>
            <p className="text-[13px] leading-relaxed text-ink">
              {notable.name} is {Math.abs(notablePct)}% above your normal
              spending this month — {money(notableDiff)} more than usual.
            </p>
          </div>
        )}

        {data.savings_goal && (
          <div
            className="mt-2.5 rounded-xl border border-green-line bg-green-soft p-3 animate-rise"
            style={{ animationDelay: "320ms" }}
          >
            <div className="flex items-baseline justify-between">
              <span className="eyebrow text-green">{data.savings_goal.label}</span>
              <span className="tnum text-[11px] text-green">
                {money(data.savings_goal.saved)} / {money(data.savings_goal.target)}
              </span>
            </div>
            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-green/15">
              <div
                className="h-full rounded-full bg-green animate-sweep"
                style={{
                  width: `${(data.savings_goal.saved / data.savings_goal.target) * 100}%`,
                  animationDelay: "380ms",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
