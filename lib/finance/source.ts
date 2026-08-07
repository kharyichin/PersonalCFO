import { DEMO_DASHBOARD } from "@/lib/finance/data";
import type { Dashboard } from "@/lib/types";

/**
 * Single place that decides where dashboard data comes from.
 *
 * FINANCE_SOURCE=backend -> BACKEND_URL/dashboard (teammate's Snowflake service)
 * anything else          -> built-in mock fixture
 *
 * Falls back to mock data on any failure (unreachable, non-200, bad JSON) so
 * a flaky teammate service never blanks the dashboard mid-demo.
 */
export async function loadDashboard(): Promise<Dashboard> {
  const url = process.env.BACKEND_URL;
  if (process.env.FINANCE_SOURCE === "backend" && url) {
    try {
      const res = await fetch(`${url}/dashboard`, {
        cache: "no-store",
        // ngrok's free-tier interstitial only targets browser navigations,
        // but this header is a no-cost safety net for server-to-server calls.
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (res.ok) return (await res.json()) as Dashboard;
      console.error(`[dashboard] backend returned ${res.status}, using demo data`);
    } catch (err) {
      console.error("[dashboard] backend unreachable, using demo data:", err);
    }
  }
  return DEMO_DASHBOARD;
}
