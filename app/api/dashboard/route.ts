import { NextResponse } from "next/server";
import { DEMO_DASHBOARD } from "@/lib/finance/data";
import type { Dashboard } from "@/lib/types";

/**
 * GET /api/dashboard
 *
 * Returns demo data by default. Point FINANCE_SOURCE=backend at the teammate's
 * Snowflake service and this proxies to it instead — no frontend changes.
 */
export async function GET() {
  if (process.env.FINANCE_SOURCE === "backend" && process.env.BACKEND_URL) {
    try {
      const res = await fetch(`${process.env.BACKEND_URL}/dashboard`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as Dashboard;
        return NextResponse.json(data);
      }
      console.error(`[dashboard] backend returned ${res.status}, using demo data`);
    } catch (err) {
      console.error("[dashboard] backend unreachable, using demo data:", err);
    }
  }

  return NextResponse.json(DEMO_DASHBOARD);
}
