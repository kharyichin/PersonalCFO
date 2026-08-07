# Personal CFO

An AI financial chief of staff — not a budgeting dashboard, not a chatbot.
It combines **Snowflake** (what you spent), a **reasoning agent** (why it
matters), and **EverOS** (what matters to *you*), so the advice it gives
sounds like it knows you, not just your transactions.

Built for a hackathon. Frontend is fully wired and demoable today; the
backend (Snowflake + Cortex Agent) is designed to slot in without touching
the UI.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4.
No auth, no database — state lives in memory for the demo, financial data is
Snowflake-shaped mock data, and long-term memory is a real, live [EverOS](https://docs.evermind.ai)
integration.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in EVEROS_API_KEY
npm run dev
```

Open `http://localhost:3000`.

## How the three pieces map to the UI

| Column | Backed by | What it proves |
|---|---|---|
| **Your money** (left) | Snowflake — currently mock data in `lib/finance/data.ts` | Real numbers: this month's spend, category breakdown, savings goal |
| **Personal CFO** (center) | `lib/cfo/engine.ts` | Answers composed from the real numbers *and* real memories — not a canned chatbot |
| **What your CFO remembers** (right) | EverOS, live | Preferences persist across conversations and get recalled on relevant questions |

## The API contract (`app/api/*`)

- `GET /api/dashboard` — spending summary. Set `FINANCE_SOURCE=backend` and
  `BACKEND_URL` in `.env.local` to point this at the real Snowflake service
  instead of the built-in mock data — no frontend changes needed.
- `POST /api/ask` — the CFO's answer engine. Detects whether the message is
  teaching it something (→ stored in EverOS) or asking a question (→
  answered using Snowflake figures + EverOS-recalled memories, either by the
  local engine or by Cortex if `CORTEX_URL` is set — see below).
- `GET|POST|DELETE /api/memory` — read, add, or forget a memory directly
  (used by the "Teach your CFO something" composer in the memory panel).

## Plugging in the Cortex Agent

`lib/cortex.ts` is the integration point. Set `CORTEX_URL` in `.env.local`
and every question in `/api/ask` routes there instead of the local engine —
nothing else in the frontend changes. If Cortex is unset, times out (8s), or
returns anything malformed, it silently falls back to the local engine so a
teammate's service being down never blanks the demo.

**What the frontend sends** (`POST` to `CORTEX_URL`):

```jsonc
{
  "user_id": "demo_user",
  "question": "What should I cut this month?",
  "financial_context": {
    "monthly_spend": 4218,
    "average_spend": 3890,
    "savings_rate": 31,
    "top_categories": [{ "name": "Food & Dining", "amount": 620, "normal": 525 }, ...]
  },
  "memories": [
    { "id": "mem-123", "text": "Travel is a priority", "quote": "Travel is important to me...", "kind": "protect", "category": "Travel" }
  ]
}
```

**What Cortex must return:**

```jsonc
{
  "answer": "I wouldn't start with travel — you've told me that's a priority...",
  "memories_used": [{ "id": "mem-123", "text": "Travel is a priority", "source": "EverOS" }],
  "evidence": [{ "label": "Food delivery", "value": "+$284", "tone": "up" }]  // optional
}
```

`memories` already comes from EverOS (fetched server-side before this call),
so Cortex doesn't need its own EverOS client — just reason over what's
handed to it. `memories_used` should be a subset of the `memories` it was
given (echo back the `id`s it actually leaned on) so the UI can highlight
them in the memory panel.

## How preferences get in

There's no onboarding form. Two channels feed EverOS:

1. **Conversation** — say "travel is important to me, don't tell me to cut
   it" to the CFO and it's extracted, stored, and recalled in later
   conversations (even new ones).
2. **Direct**, via the "+ Teach your CFO something" field in the memory
   panel — for when a preference doesn't come up naturally in chat.

In a real deployment, financial data itself comes from bank-linking
(Plaid-style OAuth) or statement upload into Snowflake — never typed by
the user. See `lib/finance/data.ts` for the shape the real pipeline should
produce.

## What's mocked vs real right now

- **Real**: EverOS memory add/flush/search (full round trip, ~5s to persist,
  ~300ms to recall).
- **Mock**: Snowflake financial data (`lib/finance/data.ts`) and the CFO's
  reasoning (`lib/cfo/engine.ts` — deterministic, not an LLM call). Both are
  designed as drop-in replacement points, not scaffolding to throw away.
