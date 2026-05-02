# Consulting Market Map Generator

A consulting research workspace that turns a single client URL into a structured
market map and first-pass consulting memo, **and** keeps that picture up-to-date
with continuous monitoring agents that revisit the client and competitor sites
on a fixed cadence. Built on **Exa** for all web research and synthesis
(`/search` with `outputSchema` — the canonical replacement for the legacy
`/answer` endpoint, per the
[Exa search API guide for coding agents](https://docs.exa.ai/reference/search-api-guide-for-coding-agents)),
with **Vercel-compatible Redis** (Upstash) for engagement persistence and
**SSE streaming** (`stream: true` on `/search`) for live memo drafting.

> See [`docs/exa-api-reference.md`](docs/exa-api-reference.md) for the full
> canonical Exa API guide this codebase follows.

> Drop a URL → multiple research agents run in parallel → you get a competitive
> landscape, market signals, customer segments, discovery questions, expert-call
> targets, a memo, a one-slide summary, and CSV/Markdown exports.

## Architecture

```
src/
├── app/
│   ├── engagements/                 # Dashboard + engagement detail
│   │   ├── page.tsx                 # All engagements (cards)
│   │   └── [id]/page.tsx            # Detail view with 12 tabs
│   ├── api/
│   │   └── engagements/
│   │       ├── route.ts             # GET list, POST create
│   │       └── [id]/
│   │           ├── route.ts         # GET one, DELETE
│   │           ├── run/route.ts     # POST → SSE stream of pipeline events
│   │           ├── events/route.ts  # GET past events for replay
│   │           ├── deep-analysis/   # POST → run deep teardown on URLs
│   │           └── export/          # GET ?format=memo|one-slide|<csv>
│   └── layout.tsx                   # App shell with sidebar
├── components/                      # Sidebar, modal, tabs/, ui primitives
├── lib/
│   ├── agents/
│   │   ├── orchestrator.ts          # Pipeline DAG (parallel + sequential)
│   │   ├── client-profile.ts        # Agent #1 — site understanding
│   │   ├── competitors.ts           # Agent #2 — discovery
│   │   ├── deep-analysis.ts         # Agent #3 — link-drop teardown
│   │   ├── emerging-players.ts      # Agent #4 — adjacent / startups
│   │   ├── market-signals.ts        # Agent #5 — funding/M&A/regulation/etc.
│   │   ├── customer-segments.ts     # Agent #6 — buyer types & pains
│   │   ├── discovery-questions.ts   # Agent #7 — first-call questions
│   │   ├── expert-calls.ts          # Agent #8 — target profiles
│   │   ├── memo.ts                  # Agent #9 — full memo (Markdown)
│   │   ├── one-slide.ts             # Agent #10 — client-ready slide
│   │   ├── context.ts               # Builds shared research context
│   │   └── base.ts                  # runAgent() wrapper + status updates
│   ├── exa.ts                       # Exa /search wrapper (+ SSE streaming)
│   ├── db.ts                        # Upstash Redis (or in-memory fallback)
│   ├── exports.ts                   # CSV generators
│   ├── engagements.ts               # Create engagement (Setup Agent)
│   └── useEngagementStream.ts       # Client SSE hook
└── types/                           # Engagement + research result types
```

The 12 agents from the spec map onto:

| Spec agent | Implementation |
| --- | --- |
| 1. Engagement Setup | `lib/engagements.ts` + `POST /api/engagements` |
| 2. Client Website Understanding | `lib/agents/client-profile.ts` |
| 3. Competitor Discovery | `lib/agents/competitors.ts` |
| 4. Deep Competitive Analysis | `lib/agents/deep-analysis.ts` + `POST /api/engagements/:id/deep-analysis` |
| 5. Emerging / Adjacent Players | `lib/agents/emerging-players.ts` |
| 6. Market Signals | `lib/agents/market-signals.ts` |
| 7. Customer Segmentation | `lib/agents/customer-segments.ts` |
| 8. Discovery Questions | `lib/agents/discovery-questions.ts` |
| 9. Expert-Call Targets | `lib/agents/expert-calls.ts` |
| 10. Research Memo | `lib/agents/memo.ts` |
| 11. One-Slide Summary | `lib/agents/one-slide.ts` |
| 12. Export | `lib/exports.ts` + `GET /api/engagements/:id/export` |

### Pipeline DAG

```
clientProfile
     │
     ├── competitors    ─┐
     ├── emergingPlayers ├── (parallel)
     ├── marketSignals   │
     └── customerSegments┘
          │
     deepCompetitiveAnalysis (uses known + top 3 competitor URLs)
          │
          ├── discoveryQuestions ─┐
          └── expertCalls         ├── (parallel)
          │
     memo (Markdown, synthesizes everything)
          │
     oneSlideSummary (client-ready slide)
```

Every agent calls **`POST /search`** with `outputSchema` (Draft-7 JSON Schema,
≤10 total properties, ≤2 levels deep — Exa's documented limits). Exa returns
the synthesized object in `output.content` and per-field citations in
`output.grounding`; we merge `results[]` and grounding URLs into one
deduplicated citation list per agent. The legacy `/answer` endpoint is **not**
used — per the canonical reference, `/search` + `outputSchema` is the
recommended replacement.

The memo agent additionally passes `stream: true` and `outputSchema: { type:
"text" }` so it can render Markdown progressively as Exa generates it (parsed
from OpenAI-compatible chat-completion chunks).

### Streaming

`POST /api/engagements/:id/run` returns a Server-Sent Events stream of
`AgentEvent`s. The client hook (`useEngagementStream`) parses chunks as they
arrive and re-fetches the persisted engagement state after each agent
completes — so even if the user navigates away and comes back, results are
still there (read from Redis).

### Storage

`@upstash/redis` is used as a Vercel-KV-compatible store. If
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are not set, the app falls
back to an in-memory `Map` (handy for local experiments; data is lost on
restart).

Engagement keys:

- `eng:{id}` — engagement record
- `eng:{id}:result:{agentType}` — per-agent result (status, data, citations)
- `eng:{id}:events` — append-only event log
- `eng:index` — sorted set of engagement IDs by `createdAt`

Monitoring keys (see "Continuous monitoring" below):

- `monitor:{eid}` — Monitor config (sources, cadence, lastRunAt, nextRunAt)
- `monitor:{eid}:finding:{fid}` — single MonitorFinding record
- `monitor:{eid}:findings:index` — zset of finding ids by `discoveredAt`
- `monitor:{eid}:seen` — array of URLs already surfaced (for dedupe)
- `monitor:{eid}:runs` — log of recent run summaries
- `monitor:index` — zset of engagement ids by `nextRunAt` (scheduler input)
- `monitor:findings:global` — zset of `{eid}:{fid}` for the cross-engagement feed

## Continuous monitoring

When you create an engagement we also spin up a **monitor**: a list of source
URLs that an Exa-powered crawler revisits on a fixed cadence. The source list
is seeded from the client URL + any known competitors and is then auto-grown
by the pipeline:

- The **competitor-discovery agent** appends direct/partial competitors with
  medium-or-better confidence (kind `competitor`).
- The **emerging-players agent** appends emerging direct threats, adjacent
  players, substitutes, and ecosystem partners with medium-or-better
  confidence (kind `emerging`), sorted so high-threat entries take priority
  if the source cap is hit.
- Domain dedupe runs across both agents, and a head-on competitor always
  wins the tie-break over the same domain showing up as an emerging player.

Each run asks Exa two questions per source — "what news has been published
_about_ this company since the last run?" and "what new pages have appeared
_on_ this company's own site?" — and turns the answers into structured
`MonitorFinding`s which are deduped against the URLs we've seen before.

Findings power two surfaces:

1. **Front-page activity feed** (`/engagements`) — newest findings across every
   engagement, with unread highlights and one-click drill-down.
2. **Per-engagement Monitoring tab** — sources you can edit, cadence you can
   tune, and a feed of findings + recent run history. "Run now" forces an
   immediate crawl regardless of cadence.

### How the scheduler runs

The crawler is driven by `POST /api/monitor/tick`, which finds every monitor
whose `nextRunAt` is in the past and runs it (with a small concurrency cap and a
hard time budget so a single tick can't get stuck). There are three ways the
endpoint gets called:

- **Vercel Cron** — recommended for production. Add a cron entry hitting
  `/api/monitor/tick` every 5 minutes (see `vercel.json` if you add one).
- **In-app TickBeacon** — a small client component mounted in the root layout
  pings the endpoint once a minute while a user has the workspace open. This is
  what makes the demo feel "alive" without external infra. It pauses while the
  tab is hidden so it doesn't burn Exa quota when nobody is watching.
- **Manual** — hit the endpoint with `curl` whenever you want to force a
  scheduler pass.

The endpoint is idempotent: if no monitor is due, the request returns quickly
with `ran: 0`. The "Run now" button on the Monitoring tab calls a separate
`POST /api/engagements/:id/monitor/run` route that bypasses the cadence gate.

### Monitoring API surface

| Method   | Path                                                              | Purpose                                       |
| -------- | ----------------------------------------------------------------- | --------------------------------------------- |
| `GET`    | `/api/notifications?limit=25`                                     | Cross-engagement findings feed                |
| `GET`    | `/api/engagements/:id/monitor`                                    | Monitor config + recent findings + runs       |
| `PATCH`  | `/api/engagements/:id/monitor`                                    | Update enabled / cadence / sources            |
| `POST`   | `/api/engagements/:id/monitor/run`                                | Force a crawl now                             |
| `POST`   | `/api/engagements/:id/monitor/findings/read`                      | `{ all: true }` or `{ findingIds: [...] }`    |
| `GET/POST` | `/api/monitor/tick`                                              | Run every monitor that's due                  |

## Getting started

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env.local
# Edit .env.local and set:
#   EXA_API_KEY                 (required)
#   UPSTASH_REDIS_REST_URL      (optional but recommended)
#   UPSTASH_REDIS_REST_TOKEN    (optional but recommended)

# 3. Run
npm run dev
# Open http://localhost:3000
```

### Where to get keys

- **Exa**: <https://dashboard.exa.ai>
- **Upstash Redis** (free tier): <https://console.upstash.com/redis> — copy the
  REST URL and REST token from the Upstash console.

## Usage

1. Click **New** in the sidebar.
2. Paste a client URL (and optionally project name, industry, geography, known
   competitors, notes).
3. Click **Create engagement** — the pipeline auto-starts and streams progress
   to the right pane.
4. As each agent finishes, the corresponding tab populates in real time.
5. Use the **Deep Analysis** tab to drop in extra competitor URLs for a
   detailed teardown.
6. Use the **Exports** tab to download the memo, one-slide, and CSVs.

## Notes & trade-offs

- **No separate LLM.** Per the takehome, all reasoning runs through Exa
  (`/search` with `outputSchema` — the canonical pattern). This keeps the
  moving parts small and the citations accurate, but means complex synthesis
  depends on Exa's hosted models rather than a customizable LLM.
- **Long-running pipeline.** Vercel limits serverless duration; the run route
  sets `maxDuration = 300`. Locally there's no limit. For very large
  engagements, consider splitting into background jobs.
- **Storage fallback.** In-memory mode is for quick local sanity checks; use
  Upstash for any real usage so engagements persist across restarts.
- **Deep analysis** runs once automatically against any `knownCompetitors`
  provided at creation plus the top 3 discovered competitors, and can be
  re-run any time with custom URLs from the Deep Analysis tab.
