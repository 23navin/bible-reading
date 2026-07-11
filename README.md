# Reading Log

A mobile-first Bible reading log. Record a voice memo (or type a note) about
what you read, get a live transcript with the passage reference parsed out,
and optionally share the log into small group chats. A reading plan tracks
which days you've completed — logging a passage that matches the plan's next
day marks it done automatically (database trigger).

Next.js 16 (App Router, RSC) on Vercel + Supabase (Postgres/RLS, Auth,
Storage, Realtime). Speech: Speechmatics realtime (primary) with OpenAI
Whisper fallback; transcript cleanup and passage parsing use Claude Haiku.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase project |
| `ANTHROPIC_API_KEY` | server | transcript cleanup + passage parse routes |
| `OPENAI_API_KEY` | server | Whisper fallback (`/api/speech/transcribe`) |
| `SPEECHMATICS_API_KEY` | server | mints short-lived realtime tokens (`/api/speech/token`). The code still falls back to the legacy misspelled `SPEECHMATIC_API_KEY`; drop the fallback in `src/app/api/speech/token/route.ts` once the Vercel env var is renamed |
| `CRON_SECRET` | server (Vercel) | authenticates the daily keep-alive cron |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` only | used only by `npm run seed:plans` — never referenced in `src/` |

## Architecture notes

- **Auth**: username+password mapped to synthetic `username@vercel.user`
  emails. `src/proxy.ts` gates every request via `getClaims()` (local JWT
  verify — do not swap in `getUser()`, it would add an auth-server round
  trip per request). Pages and server actions still verify for themselves
  (`requireUser()` / `getSession()` in `src/lib/auth/session.ts`) because
  server actions POST to page routes.
- **API routes** (`src/app/api/*`) all check auth themselves too and return
  401 JSON; they carry input-size caps and `maxDuration` exports.
- **Writes** happen client-side through supabase-js under RLS; the shared
  insert path is `src/lib/db/insert-log.ts`. Note: `.insert().select()`
  (RETURNING) requires the creator to satisfy the row's SELECT policy —
  fine for `messages`, not for `chats` (see `create-chat.ts`).
- **Migrations**: `migrations/0000_baseline.sql` is a documentation-only
  snapshot of the dashboard-created base schema (do not apply to prod);
  `0001+` were applied by hand / via MCP in order. To rebuild a fresh
  database: apply 0000, then 0017+.
- **Reading plans**: JSON files in `src/data/reading-plans/` seed the
  `reading_plans` / `reading_plan_entries` tables via `npm run seed:plans`.
  Progress rows are written by the `record_reading_plan_progress` trigger
  on `messages`, keyed on the structured passage columns.
- **Keep-alive**: `vercel.json` schedules a daily hit to
  `/api/cron/keep-alive` so the Supabase free-tier project never pauses
  for 7-day inactivity.

## Known costs / risks (free tier)

- **Audio is never deleted.** Voice memos (32 kbps mono, private
  `audio-memos` bucket, signed on tap, `preload="none"`) accumulate toward
  the 1 GB Supabase Storage cap — roughly 72 hours of audio. At personal
  volume that's years away; revisit if usage grows. Delete only via the
  Storage API, never SQL.
- The AI routes are authenticated but not rate-limited per user; cost
  exposure is bounded by who has accounts.

## Development

```bash
npm run dev      # against the production Supabase project — be careful
npm run build && npm run lint
npm run seed:plans
```

There is no local Supabase stack; the curl-driven verification flow lives
in `.claude/skills/verify/SKILL.md`.
