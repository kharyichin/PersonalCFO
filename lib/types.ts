/**
 * The contract between this frontend and the backend.
 *
 * These shapes match exactly what the backend team is building, so swapping
 * from the built-in demo data to the real Snowflake/Cortex API is a config
 * change, not a rewrite. See lib/finance/source.ts.
 */

export type Category = {
  name: string;
  amount: number;
  /** Same category last month — powers the "vs normal" comparison. */
  normal: number;
};

/** GET /dashboard */
export type Dashboard = {
  monthly_spend: number;
  average_spend: number;
  savings_rate: number;
  top_categories: Category[];
  /** Optional extras the UI degrades gracefully without. */
  month_label?: string;
  income?: number;
  savings_goal?: SavingsGoal;
  insights?: Insight[];
};

export type SavingsGoal = {
  label: string;
  target: number;
  saved: number;
  monthly_pace: number;
};

export type Insight = {
  headline: string;
  detail: string;
  tone: "attention" | "positive" | "neutral";
};

/** A single thing the CFO remembers about you. Backed by EverOS. */
export type Memory = {
  id: string;
  /** Short display label, e.g. "Travel is a priority". */
  text: string;
  /** What the user actually said, kept for provenance. */
  quote?: string;
  source: "EverOS";
  created_at: string;
  /** True while EverOS is still extracting it in the background. */
  pending?: boolean;
  /** How the CFO should act on this memory. */
  kind?: "protect" | "reduce" | "goal" | "general";
  /** Dashboard category this memory applies to, if any. */
  category?: string | null;
};

/** POST /ask */
export type AskRequest = {
  user_id: string;
  question: string;
};

export type AskResponse = {
  answer: string;
  memories_used: { id?: string; text: string; source: string }[];
  financial_context: {
    monthly_spend: number;
    average_monthly_spend: number;
    savings_rate: number;
    largest_increase_category: string;
  };
  /**
   * Optional. Set when this message taught the CFO something new.
   * The real backend can omit it — the UI handles its absence.
   */
  learned?: Memory | null;
  /** Optional supporting figures rendered under the answer. */
  evidence?: { label: string; value: string; tone?: "up" | "down" | "flat" }[];
};

/** POST /memory */
export type MemoryRequest = {
  user_id: string;
  memory: string;
};
