import { NextResponse } from "next/server";
import { loadDashboard } from "@/lib/finance/source";

/**
 * GET /api/dashboard
 *
 * Returns demo data by default. Point FINANCE_SOURCE=backend at the teammate's
 * Snowflake service and this proxies to it instead — no frontend changes.
 */
export async function GET() {
  return NextResponse.json(await loadDashboard());
}
