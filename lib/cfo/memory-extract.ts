/**
 * Turns what the user typed into a short, clean memory label.
 *
 * EverOS stores the full conversation and does its own extraction; this is
 * purely for the UI, so "Travel is really important to me, don't ever tell me
 * to cut it" shows up as the tidy pill "Travel is a priority".
 */

export type MemoryKind = "protect" | "reduce" | "goal" | "general";

export type ExtractedMemory = {
  label: string;
  kind: MemoryKind;
  /** Canonical dashboard category this applies to, if any. */
  category: string | null;
  quote: string;
};

const CATEGORY_WORDS: [RegExp, string][] = [
  [/\b(travel|trips?|flights?|holidays?|vacations?)\b/i, "Travel"],
  [/\b(food delivery|delivery|takeaway|takeout|doordash|uber\s?eats|deliveroo)\b/i, "Food delivery"],
  [/\b(food|dining|eating out|restaurants?|groceries)\b/i, "Food & Dining"],
  [/\b(shopping|clothes|clothing|retail)\b/i, "Shopping"],
  [/\b(subscriptions?|streaming)\b/i, "Subscriptions"],
  [/\b(transport|commute|uber|taxis?|fuel|petrol|gas)\b/i, "Transport"],
  [/\b(housing|rent|mortgage)\b/i, "Housing"],
  [/\b(health|gym|fitness|medical)\b/i, "Health"],
];

function categoryIn(text: string): string | null {
  for (const [re, name] of CATEGORY_WORDS) {
    if (re.test(text)) return name;
  }
  return null;
}

/** Does this message look like the user telling us something to remember? */
const PROTECT_RE =
  /(don'?t|do not|never|please don'?t)\b[^.!?]*\b(cut|reduce|touch|trim|lower|suggest cutting)\b|\bis (really |very |super |genuinely )?important to me\b|\bis a priority\b|\bmatters to me\b|\bnon-?negotiable\b/i;

const REDUCE_RE =
  /\b(i(')?d rather|i want to|i'?d like to|help me|trying to|want to)\b[^.!?]*\b(reduce|cut|spend less|cut back|lower)\b|\b(reduce|cut back on|spend less on)\b/i;

const GOAL_RE =
  /\b(saving|save|savings)\b[^.!?]*\b(for|toward|towards)\b|\bsaving up\b|\bmy goal\b|\bgoal is\b/i;

const PREFERENCE_RE =
  /\b(i prefer|remember that|keep in mind|note that|for the record|i always|i usually)\b/i;

export function looksLikeMemory(text: string): boolean {
  return (
    PROTECT_RE.test(text) ||
    REDUCE_RE.test(text) ||
    GOAL_RE.test(text) ||
    PREFERENCE_RE.test(text)
  );
}

export function extractMemory(text: string): ExtractedMemory | null {
  const quote = text.trim();
  if (!looksLikeMemory(quote)) return null;

  const category = categoryIn(quote);

  if (PROTECT_RE.test(quote)) {
    return {
      label: category ? `${category} is a priority` : "Has spending they don't want cut",
      kind: "protect",
      category,
      quote,
    };
  }

  if (GOAL_RE.test(quote)) {
    const target = quote.match(/\$\s?([\d,]+)/);
    const thing = quote.match(/\b(?:for|toward|towards)\s+(?:a\s+|an\s+|my\s+)?([\w\s]{2,28})/i);
    const what = thing?.[1]?.trim().replace(/[.,!?]$/, "");
    return {
      label: what
        ? `Saving toward ${what}${target ? ` (${target[0].replace(/\s/g, "")})` : ""}`
        : "Saving toward a large purchase",
      kind: "goal",
      category: null,
      quote,
    };
  }

  if (REDUCE_RE.test(quote)) {
    return {
      label: category ? `Wants to reduce ${category.toLowerCase()}` : "Wants to cut unnecessary spending",
      kind: "reduce",
      category,
      quote,
    };
  }

  return {
    label: category ? `Has a preference about ${category.toLowerCase()}` : "Shared a spending preference",
    kind: "general",
    category,
    quote,
  };
}

/**
 * A single message can carry two memories:
 * "Don't cut travel, I'd rather reduce food delivery."
 * Returns them in the order they should appear.
 */
export function extractAll(text: string): ExtractedMemory[] {
  const out: ExtractedMemory[] = [];
  const clauses = text.split(/[.;]|\bbut\b|\binstead\b|\brather\b/i).filter((c) => c.trim().length > 6);

  for (const clause of clauses) {
    const m = extractMemory(clause);
    if (m && !out.some((o) => o.label === m.label)) out.push(m);
  }

  if (out.length === 0) {
    const whole = extractMemory(text);
    if (whole) out.push(whole);
  }

  // "I'd rather reduce X" loses its verb when split on "rather" — catch it.
  if (out.length === 1 && out[0].kind === "protect") {
    const tail = text.split(/\brather\b|\binstead\b/i)[1];
    if (tail) {
      const second = extractMemory(`I want to reduce ${tail}`);
      if (second && second.label !== out[0].label) out.push(second);
    }
  }

  return out.slice(0, 2);
}
