import type { Dashboard } from "@/lib/types";

/**
 * Demo financial data — stands in for Snowflake until the backend is live.
 *
 * The numbers are internally consistent on purpose: category amounts sum to
 * monthly_spend (4218) and the "normal" column sums to average_spend (3890),
 * so anything the CFO says can be checked against the dashboard on screen.
 * A judge who adds up the categories should get the same total.
 */
export const DEMO_DASHBOARD: Dashboard = {
  month_label: "This month",
  monthly_spend: 4218,
  average_spend: 3890,
  savings_rate: 31,
  income: 6110,
  top_categories: [
    { name: "Housing", amount: 1800, normal: 1800 },
    { name: "Food & Dining", amount: 620, normal: 525 },
    { name: "Travel", amount: 540, normal: 500 },
    { name: "Shopping", amount: 395, normal: 340 },
    { name: "Transport", amount: 310, normal: 295 },
    { name: "Health", amount: 205, normal: 190 },
    { name: "Subscriptions", amount: 148, normal: 140 },
    { name: "Other", amount: 200, normal: 100 },
  ],
  savings_goal: {
    label: "Large purchase fund",
    target: 12000,
    saved: 7400,
    monthly_pace: 1892,
  },
};

/**
 * Merchant-level detail inside Food & Dining.
 *
 * This is what lets the CFO say something a budgeting app can't: the category
 * only moved +$95, but that hides delivery being up $284 while groceries fell.
 */
export const FOOD_BREAKDOWN = [
  { name: "Food delivery", amount: 431, normal: 147, change: 284 },
  { name: "Groceries", amount: 96, normal: 285, change: -189 },
  { name: "Restaurants", amount: 93, normal: 93, change: 0 },
];

/** Individual transactions that back up the "unusual" answer. */
export const NOTABLE_TRANSACTIONS = [
  { merchant: "DoorDash", count: 19, amount: 431, note: "19 orders, up from 6" },
  { merchant: "Unused subscriptions", count: 3, amount: 48, note: "no activity in 60 days" },
  { merchant: "Airline — Lisbon", count: 1, amount: 410, note: "booked, one-off" },
];

export function pctChange(current: number, normal: number): number {
  if (normal === 0) return 0;
  return Math.round(((current - normal) / normal) * 100);
}

export function money(n: number): string {
  return "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
}
