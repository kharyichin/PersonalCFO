"use client";

import type { ReactNode } from "react";

/**
 * Hover label for explaining what a badge/pill means during a demo — e.g.
 * "Snowflake" or "recalled 2 from EverOS" aren't self-explanatory to a judge
 * glancing at the screen without narration.
 *
 * CSS-only (group-hover), no positioning library: every place this is used
 * has a predictable spot on screen, so a simple absolute-positioned label
 * is enough and stays reliable without JS measuring viewport edges.
 */
export default function Tooltip({
  content,
  children,
  align = "center",
  side = "bottom",
}: {
  content: string;
  children: ReactNode;
  /** Use "right" when the trigger sits near a panel's right edge, so the
   *  label doesn't overflow off-screen. */
  align?: "center" | "right";
  side?: "top" | "bottom";
}) {
  const sidePos = side === "bottom" ? "top-full mt-2" : "bottom-full mb-2";
  const alignPos =
    align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-[180px] rounded-lg bg-ink px-2.5 py-1.5 text-[11px] leading-snug text-paper opacity-0 shadow-[0_4px_16px_rgba(20,20,15,0.18)] transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${sidePos} ${alignPos}`}
      >
        {content}
      </span>
    </span>
  );
}
