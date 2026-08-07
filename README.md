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
  answered using Snowflake figures + EverOS-recalled memories). This route
  is the one seam to wire in the real Cortex Agent later.
- `GET|POST|DELETE /api/memory` — read, add, or forget a memory directly
  (used by the "Teach your CFO something" composer in the memory panel).

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
