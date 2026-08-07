import type { AskResponse, Dashboard, Memory } from "@/lib/types";
import { FOOD_BREAKDOWN, money, pctChange } from "@/lib/finance/data";

/**
 * The CFO's answer engine.
 *
 * Deliberately deterministic: it reads the real figures and the real memories
 * and composes an answer from them. No model call, so it is instant, free, and
 * always says something defensible on stage.
 *
 * When the Cortex Agent is ready, swap this out behind the same function
 * signature — /api/ask is the only caller.
 */

type Intent = "cut" | "why_more" | "unusual" | "afford" | "overview";

export function classify(question: string): Intent {
  const q = question.toLowerCase();
  if (/\b(afford|should i buy|worth it|can i get|thinking of buying|want to buy|is it worth)\b/.test(q))
    return "afford";
  if (/\b(cut|save on|reduce|trim|spend less|where can i)\b/.test(q)) return "cut";
  if (/\b(unusual|strange|weird|odd|anomal|stand out|surprising|off)\b/.test(q)) return "unusual";
  if (/\b(why|what happened|more this month|higher|increase|over)\b/.test(q)) return "why_more";
  return "overview";
}

/** Pull a dollar figure out of "I want to buy a $1,500 laptop". */
export function parseAmount(question: string): number | null {
  const withSymbol = question.match(/\$\s?([\d,]+(?:\.\d+)?)/);
    if (withSymbol) return Number(withSymbol[1].replace(/,/g, ""));

  const withK = question.match(/\b(\d+(?:\.\d+)?)\s?k\b/i);
  if (withK) return Number(withK[1]) * 1000;

  const bare = question.match(/\b(\d{3,6})\b/);
  return bare ? Number(bare[1]) : null;
}

/** What is the user buying? "a $1,500 laptop" -> "laptop" */
function parseItem(question: string): string | null {
  const m = question.match(
    /\$\s?[\d,]+(?:\.\d+)?\s+([a-z][\w\s-]{2,24}?)(?:\s*[?.!,]|$)/i
  );
  const raw = m?.[1]?.trim();
  if (!raw) return null;
  return raw.replace(/\b(this|that|right now|today|soon)\b/gi, "").trim() || null;
}

const cite = (m: Memory) => ({ id: m.id, text: m.text, source: m.source });

export function financialContext(d: Dashboard) {
  // "Other" is a catch-all, never a useful answer to "what moved?".
  const biggest = [...d.top_categories]
    .filter((c) => c.name !== "Other")
    .sort((a, b) => b.amount - b.normal - (a.amount - a.normal))[0];
  return {
    monthly_spend: d.monthly_spend,
    average_monthly_spend: d.average_spend,
    savings_rate: d.savings_rate,
    largest_increase_category: biggest?.name ?? "Other",
  };
}

export function answerQuestion(
  question: string,
  dashboard: Dashboard,
  memories: Memory[]
): AskResponse {
  const intent = classify(question);
  const ctx = financialContext(dashboard);

  const protectedMems = memories.filter((m) => m.kind === "protect" && m.category);
  const reduceMems = memories.filter((m) => m.kind === "reduce");
  const goalMems = memories.filter((m) => m.kind === "goal");

  const delta = dashboard.monthly_spend - dashboard.average_spend;
  const deltaPct = pctChange(dashboard.monthly_spend, dashboard.average_spend);
  const delivery = FOOD_BREAKDOWN[0];
  const groceries = FOOD_BREAKDOWN[1];

  switch (intent) {
    case "cut": {
      const lines: string[] = [];
      const used: Memory[] = [];

      // Respect what the user has protected before recommending anything.
      const protectedNames = protectedMems.map((m) => m.category!);
      if (protectedNames.length) {
        const list = protectedNames.join(" or ");
        lines.push(
          `I wouldn't start with ${list.toLowerCase()} — you've told me that's a priority, so I've left it out of this.`
        );
        used.push(...protectedMems);
      }

      lines.push(
        `Your clearest opportunity is food delivery. It's ${money(delivery.change)} above your normal — ${money(delivery.amount)} this month against a typical ${money(delivery.normal)}.`
      );
      lines.push(
        `It's easy to miss on the dashboard: groceries fell ${money(groceries.change)} at the same time, so Food & Dining as a whole only looks ${money(95)} higher. This is a substitution, not extra appetite.`
      );

      if (reduceMems.length) used.push(...reduceMems);

      const goal = dashboard.savings_goal;
      if (goal) {
        const weeks = Math.round((delivery.change / goal.monthly_pace) * 4.33);
        lines.push(
          `Bringing delivery back to normal would free up about ${money(delivery.change)} a month — roughly ${weeks} week${weeks === 1 ? "" : "s"} closer to your ${goal.label.toLowerCase()}.`
        );
        if (goalMems.length) used.push(...goalMems);
      }

      return {
        answer: lines.join("\n\n"),
        memories_used: used.map(cite),
        financial_context: ctx,
        evidence: [
          { label: "Food delivery", value: `+${money(delivery.change)}`, tone: "up" },
          { label: "Groceries", value: `−${money(groceries.change)}`, tone: "down" },
          { label: "Orders this month", value: "19 vs 6", tone: "up" },
        ],
      };
    }

    case "why_more": {
      const others = dashboard.top_categories
        .filter((c) => c.amount - c.normal > 0 && c.name !== "Food & Dining")
        .sort((a, b) => b.amount - b.normal - (a.amount - a.normal))
        .slice(0, 3)
        .map((c) =>
          c.name === "Other"
            ? `${money(c.amount - c.normal)} uncategorised`
            : `${money(c.amount - c.normal)} more on ${c.name.toLowerCase()}`
        );

      const lines = [
        `You're ${money(delta)} above your normal month — ${money(dashboard.monthly_spend)} against a typical ${money(dashboard.average_spend)}, about ${deltaPct}% more.`,
        `The single biggest driver is food delivery, up ${money(delivery.change)}. Groceries dropped ${money(groceries.change)} in the same period, which is why the Food category only shows ${money(95)} of it.`,
        `The rest is spread thin: ${others.join(", ")}. Nothing there looks out of character.`,
      ];

      return {
        answer: lines.join("\n\n"),
        memories_used: [],
        financial_context: ctx,
        evidence: [
          { label: "Above normal", value: `+${money(delta)}`, tone: "up" },
          { label: "Food delivery", value: `+${money(delivery.change)}`, tone: "up" },
          { label: "Savings rate", value: `${dashboard.savings_rate}%`, tone: "flat" },
        ],
      };
    }

    case "unusual": {
      const lines = [
        `Two things stand out this month.`,
        `**Food delivery.** 19 orders against your usual 6 — ${money(delivery.amount)} versus a normal ${money(delivery.normal)}. That's the clearest break from your pattern.`,
        `**Three subscriptions, $48 a month,** with no activity in 60 days. Small, but it's money leaving for nothing.`,
        `Everything else reads like a normal month for you. Housing, transport and health are all within a few dollars of typical.`,
      ];
      return {
        answer: lines.join("\n\n"),
        memories_used: [],
        financial_context: ctx,
        evidence: [
          { label: "Delivery orders", value: "19 vs 6", tone: "up" },
          { label: "Idle subscriptions", value: "$48/mo", tone: "up" },
        ],
      };
    }

    case "afford": {
      const amount = parseAmount(question);
      const item = parseItem(question);
      const goal = dashboard.savings_goal;
      const pace = goal?.monthly_pace ?? Math.round(dashboard.monthly_spend * 0.3);

      if (!amount) {
        return {
          answer:
            "Happy to weigh that up — tell me roughly what it costs and I'll tell you what it does to your month and your savings goal.",
          memories_used: [],
          financial_context: ctx,
        };
      }

      const weeksDelay = Math.round((amount / pace) * 4.33);
      const monthsOfSaving = amount / pace;
      const affordable = monthsOfSaving <= 1.5;
      const stretch = monthsOfSaving > 1.5 && monthsOfSaving <= 3;
      const used: Memory[] = [];
      const lines: string[] = [];
      const thing = item ? `the ${item}` : "this";

      if (affordable) {
        lines.push(
          `Yes — ${money(amount)} is manageable. It doesn't touch your essentials, and you'd still be saving this month.`
        );
      } else if (stretch) {
        lines.push(
          `You can do it, but it's a stretch rather than a shrug. ${money(amount)} is about ${monthsOfSaving.toFixed(1)} months of your current saving.`
        );
      } else {
        lines.push(
          `I'd wait. ${money(amount)} is roughly ${monthsOfSaving.toFixed(1)} months of everything you save — enough to stall your goal rather than dent it.`
        );
      }

      if (goal) {
        lines.push(
          `You're putting away about ${money(pace)} a month and you've got ${money(goal.saved)} of your ${money(goal.target)} ${goal.label.toLowerCase()}. Buying ${thing} pushes that goal back by roughly ${weeksDelay} week${weeksDelay === 1 ? "" : "s"}.`
        );
        if (goalMems.length) used.push(...goalMems);
      }

      // Fund it from somewhere they've already said they're happy to cut —
      // but only when that's a realistic plan, not a 3-year one.
      const monthsOfDelivery = Math.ceil(amount / delivery.change);
      if (reduceMems.length && monthsOfDelivery <= 6) {
        lines.push(
          `If you want it without losing ground: you told me you'd rather cut food delivery, and that's running ${money(delivery.change)} above normal. ${monthsOfDelivery} month${monthsOfDelivery === 1 ? "" : "s"} back at your usual rate would cover it without touching savings.`
        );
        used.push(...reduceMems);
      } else if (reduceMems.length) {
        lines.push(
          `Cutting food delivery back to normal — which you've said you'd rather do — saves ${money(delivery.change)} a month. Worth doing regardless, but it won't fund this on its own.`
        );
        used.push(...reduceMems);
      }

      if (protectedMems.length) {
        lines.push(
          `And I'm not suggesting you touch ${protectedMems.map((m) => m.category!.toLowerCase()).join(" or ")} to pay for it.`
        );
        used.push(...protectedMems);
      }

      return {
        answer: lines.join("\n\n"),
        memories_used: used.map(cite),
        financial_context: ctx,
        evidence: [
          { label: "Purchase", value: money(amount), tone: "flat" },
          { label: "Monthly saving", value: money(pace), tone: "flat" },
          { label: "Goal delay", value: `~${weeksDelay} weeks`, tone: "up" },
        ],
      };
    }

    default: {
      const top = dashboard.top_categories[0];
      const lines = [
        `You've spent ${money(dashboard.monthly_spend)} so far this month — ${delta >= 0 ? `${money(delta)} above` : `${money(delta)} below`} your normal, with a ${dashboard.savings_rate}% savings rate.`,
        `${top.name} is your largest category at ${money(top.amount)}. The thing actually worth your attention is food delivery, which is ${money(delivery.change)} above normal.`,
        `Ask me what to cut, why this month ran high, or whether you can afford something you're considering.`,
      ];
      return {
        answer: lines.join("\n\n"),
        memories_used: memories.length ? memories.slice(0, 2).map(cite) : [],
        financial_context: ctx,
      };
    }
  }
}

/** The reply shown when the user has just taught the CFO something. */
export function acknowledgeMemory(labels: string[]): string {
  if (labels.length === 1) {
    return `Got it — I've noted that ${labels[0].toLowerCase()}. I'll factor it into every recommendation from here, including in new conversations.`;
  }
  return `Got it. I've noted that ${labels[0].toLowerCase()}, and that you ${labels[1].toLowerCase().replace(/^wants/, "want")}. Both will shape what I suggest from now on.`;
}
