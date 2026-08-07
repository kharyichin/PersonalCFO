import type { AskResponse, Category, Dashboard, Memory } from "@/lib/types";
import { money, pctChange } from "@/lib/finance/data";

/**
 * The CFO's answer engine.
 *
 * Deliberately deterministic: it reads the real figures and the real memories
 * and composes an answer from them. No model call, so it is instant, free, and
 * always says something defensible on stage.
 *
 * Everything below reads from `dashboard.top_categories` — no category names
 * or dollar amounts are hardcoded. That matters because the dashboard can be
 * demo fixture data or a teammate's real Snowflake feed (FINANCE_SOURCE=backend)
 * with completely different categories; the engine has to work for either.
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

/**
 * Categories worth mentioning, ranked by how far over normal they ran.
 * "Other" is a catch-all bucket, not a real category — never cite it.
 * Tiny swings (<$15) are noise, not insight.
 */
function risingCategories(d: Dashboard, limit = 4): Category[] {
  return [...d.top_categories]
    .filter((c) => c.name !== "Other" && c.amount - c.normal >= 15)
    .sort((a, b) => b.amount - b.normal - (a.amount - a.normal))
    .slice(0, limit);
}

/** Categories that moved the most in % terms — good for "what's unusual". */
function mostVolatileCategories(d: Dashboard, limit = 2): Category[] {
  return [...d.top_categories]
    .filter((c) => c.name !== "Other" && Math.abs(c.amount - c.normal) >= 15)
    .sort((a, b) => Math.abs(pctChange(b.amount, b.normal)) - Math.abs(pctChange(a.amount, a.normal)))
    .slice(0, limit);
}

/**
 * Loosely match a memory's category hint (e.g. "Food delivery") against a
 * real dashboard category (e.g. "Food & Dining") by shared words. Memory
 * categories can be more granular than what a dashboard actually reports —
 * this is the seam between the two vocabularies.
 */
function matchCategory(d: Dashboard, hint: string | null | undefined): Category | null {
  if (!hint) return null;
  const hintWords = hint.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const scored = d.top_categories
    .map((c) => {
      const catWords = c.name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
      const overlap = hintWords.filter((w) => catWords.includes(w)).length;
      return { c, overlap };
    })
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  return scored[0]?.c ?? null;
}

function describeCategory(c: Category): string {
  const diff = c.amount - c.normal;
  return `${money(diff)} above your normal — ${money(c.amount)} this month against a typical ${money(c.normal)}`;
}

/** "3 weeks" / "1 week" / "less than a week" — never "0 weeks". */
function weeksPhrase(weeks: number): string {
  const rounded = Math.round(weeks);
  if (rounded <= 0) return "less than a week";
  if (rounded === 1) return "1 week";
  return `${rounded} weeks`;
}

export function financialContext(d: Dashboard) {
  const [biggest] = risingCategories(d, 1);
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

  // Dashboard categories that match something the user asked to protect —
  // excluded from anything this engine recommends cutting.
  const protectedCategoryNames = new Set(
    protectedMems
      .map((m) => matchCategory(dashboard, m.category)?.name)
      .filter(Boolean) as string[]
  );

  switch (intent) {
    case "cut": {
      const lines: string[] = [];
      const used: Memory[] = [];

      const protectedNames = protectedMems.map((m) => m.category!);
      if (protectedNames.length) {
        lines.push(
          `I wouldn't start with ${protectedNames.join(" or ").toLowerCase()} — you've told me that's a priority, so I've left it out of this.`
        );
        used.push(...protectedMems);
      }

      const candidates = risingCategories(dashboard).filter(
        (c) => !protectedCategoryNames.has(c.name)
      );
      const opportunity = candidates[0];

      if (!opportunity) {
        lines.push(
          "Nothing is running noticeably over normal right now — this was a pretty average month. I'd hold off cutting anything until something actually moves."
        );
        return { answer: lines.join("\n\n"), memories_used: used.map(cite), financial_context: ctx };
      }

      lines.push(
        `Your clearest opportunity is ${opportunity.name.toLowerCase()}. It's ${describeCategory(opportunity)}.`
      );

      const runnerUp = candidates[1];
      if (runnerUp) {
        lines.push(
          `After that, ${runnerUp.name.toLowerCase()} is running ${money(runnerUp.amount - runnerUp.normal)} over normal too — worth a look if you want to go further.`
        );
      }

      // Only cite a reduce-memory if it's actually about a category this
      // answer names (opportunity/runnerUp) — not just any "reduce
      // something" memory in storage. Citing "wants to reduce food
      // delivery" next to an answer that only discusses Fees would claim
      // credit the memory didn't earn.
      const discussedNames = new Set(
        [opportunity.name, runnerUp?.name].filter(Boolean) as string[]
      );
      const relevantReduceMems = reduceMems.filter((m) => {
        const match = matchCategory(dashboard, m.category);
        return match && discussedNames.has(match.name);
      });
      if (relevantReduceMems.length) used.push(...relevantReduceMems);

      const goal = dashboard.savings_goal;
      const oppDelta = opportunity.amount - opportunity.normal;
      if (goal) {
        const weeks = (oppDelta / goal.monthly_pace) * 4.33;
        lines.push(
          `Bringing ${opportunity.name.toLowerCase()} back to normal would free up about ${money(oppDelta)} a month — roughly ${weeksPhrase(weeks)} closer to your ${goal.label.toLowerCase()}.`
        );
        // Same logic for goals: cite only the first one. Multiple
        // simultaneous goal memories can't all correspond to the single
        // dashboard savings_goal figure this sentence actually cites.
        if (goalMems.length) used.push(goalMems[0]);
      }

      return {
        answer: lines.join("\n\n"),
        memories_used: used.map(cite),
        financial_context: ctx,
        evidence: [
          { label: opportunity.name, value: `+${money(oppDelta)}`, tone: "up" },
          ...(runnerUp
            ? [{ label: runnerUp.name, value: `+${money(runnerUp.amount - runnerUp.normal)}`, tone: "up" as const }]
            : []),
        ],
      };
    }

    case "why_more": {
      const rising = risingCategories(dashboard, 4);
      const [top, ...rest] = rising;

      if (!top) {
        return {
          answer: `You're actually right in line with your normal this month — ${money(dashboard.monthly_spend)} against a typical ${money(dashboard.average_spend)}. Nothing stands out.`,
          memories_used: [],
          financial_context: ctx,
        };
      }

      const restList = rest
        .map((c) => `${money(c.amount - c.normal)} more on ${c.name.toLowerCase()}`)
        .join(", ");

      const lines = [
        `You're ${money(delta)} above your normal month — ${money(dashboard.monthly_spend)} against a typical ${money(dashboard.average_spend)}, about ${deltaPct}% more.`,
        `The single biggest driver is ${top.name.toLowerCase()}, up ${money(top.amount - top.normal)}.`,
        rest.length
          ? `The rest is spread thin: ${restList}. Nothing there looks out of character.`
          : `Everything else is close to normal — this is really a one-category story.`,
      ];

      return {
        answer: lines.join("\n\n"),
        memories_used: [],
        financial_context: ctx,
        evidence: [
          { label: "Above normal", value: `+${money(delta)}`, tone: "up" },
          { label: top.name, value: `+${money(top.amount - top.normal)}`, tone: "up" },
          { label: "Savings rate", value: `${dashboard.savings_rate}%`, tone: "flat" },
        ],
      };
    }

    case "unusual": {
      const volatile = mostVolatileCategories(dashboard, 2);

      if (volatile.length === 0) {
        return {
          answer:
            "Nothing really stands out — every category is close enough to your normal that this reads as an ordinary month.",
          memories_used: [],
          financial_context: ctx,
        };
      }

      const lines = [
        volatile.length > 1
          ? "Two things stand out this month."
          : "One thing stands out this month.",
      ];
      volatile.forEach((c, i) => {
        const diff = c.amount - c.normal;
        const pct = pctChange(c.amount, c.normal);
        const direction = diff > 0 ? "up" : "down";
        const tail =
          i === 0
            ? "That's the clearest break from your usual pattern."
            : "That's the next biggest break from pattern — smaller, but still worth a glance.";
        lines.push(
          `**${c.name}.** ${money(c.amount)} against a normal ${money(c.normal)} — ${direction} ${Math.abs(pct)}%. ${tail}`
        );
      });
      // Only reassure about "everything else" if that's actually true —
      // don't claim categories are close to normal when they aren't.
      const rest = dashboard.top_categories.filter(
        (c) => c.name !== "Other" && !volatile.some((v) => v.name === c.name)
      );
      const restIsQuiet = rest.every(
        (c) => Math.abs(c.amount - c.normal) < 20 || Math.abs(pctChange(c.amount, c.normal)) < 10
      );
      lines.push(
        restIsQuiet
          ? "Everything else reads like a normal month for you — close to typical."
          : "There's some movement elsewhere too, but these are the two clearest breaks from your pattern."
      );

      return {
        answer: lines.join("\n\n"),
        memories_used: [],
        financial_context: ctx,
        evidence: volatile.map((c) => ({
          label: c.name,
          value: `${c.amount - c.normal > 0 ? "+" : "−"}${money(Math.abs(c.amount - c.normal))}`,
          tone: c.amount - c.normal > 0 ? ("up" as const) : ("down" as const),
        })),
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

      const weeksDelay = (amount / pace) * 4.33;
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
          `You're putting away about ${money(pace)} a month and you've got ${money(goal.saved)} of your ${money(goal.target)} ${goal.label.toLowerCase()}. Buying ${thing} pushes that goal back by roughly ${weeksPhrase(weeksDelay)}.`
        );
        // Cite only the first goal memory — the dashboard's single
        // savings_goal figure can't honestly stand in for more than one.
        if (goalMems.length) used.push(goalMems[0]);
      }

      // Fund it from somewhere they've already said they're happy to cut —
      // only if that category actually shows a real, meaningful surplus.
      // Only reduceMems[0] is ever checked/named in the text below, so
      // that's the only one that gets cited — not every reduce-memory in
      // storage, which might be about a completely different category.
      if (reduceMems.length) {
        const match = matchCategory(dashboard, reduceMems[0].category);
        const surplus = match ? match.amount - match.normal : 0;

        if (match && surplus >= 15) {
          const months = Math.ceil(amount / surplus);
          if (months <= 6) {
            lines.push(
              `If you want it without losing ground: you told me you'd rather cut ${match.name.toLowerCase()}, and that's running ${money(surplus)} above normal. ${months} month${months === 1 ? "" : "s"} back at your usual rate would cover it without touching savings.`
            );
          } else {
            lines.push(
              `Cutting ${match.name.toLowerCase()} back to normal — which you've said you'd rather do — saves ${money(surplus)} a month. Worth doing regardless, but it won't fund this on its own.`
            );
          }
        } else {
          lines.push(
            `You've told me you'd rather cut back elsewhere than touch this — that preference stands, even though it's not one of the bigger swings this month.`
          );
        }
        used.push(reduceMems[0]);
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
          { label: "Goal delay", value: weeksPhrase(weeksDelay), tone: "up" },
        ],
      };
    }

    default: {
      const top = dashboard.top_categories[0];
      const [notable] = risingCategories(dashboard, 1);
      const lines = [
        `You've spent ${money(dashboard.monthly_spend)} so far this month — ${delta >= 0 ? `${money(delta)} above` : `${money(delta)} below`} your normal, with a ${dashboard.savings_rate}% savings rate.`,
        !notable
          ? `${top.name} is your largest category at ${money(top.amount)}. Nothing is running noticeably over normal right now.`
          : notable.name === top.name
            ? `${top.name} is both your largest category and the one running furthest over normal — ${money(notable.amount - notable.normal)} above typical.`
            : `${top.name} is your largest category at ${money(top.amount)}. The thing actually worth your attention is ${notable.name.toLowerCase()}, which is ${money(notable.amount - notable.normal)} above normal.`,
        `Ask me what to cut, why this month ran high, or whether you can afford something you're considering.`,
      ];
      // This overview is pure numbers — largest category, notable swing,
      // totals — it doesn't reason over any memory content, so there's
      // nothing honest to cite here. (Previously cited up to 2 arbitrary
      // stored memories regardless of relevance — same class of bug as
      // the "cut" and "afford" cases above.)
      return {
        answer: lines.join("\n\n"),
        memories_used: [],
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
