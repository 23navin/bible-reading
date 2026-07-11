# Architecture & Design

This document explains how the Reading Log app works, end to end, for someone
who has never seen the codebase. It covers the product, the stack, the data
model, security, every major data flow, and the reasoning behind the less
obvious decisions. The [README](../README.md) is the condensed version; this
is the long one.

---

## 1. What the app is

A **mobile-first Bible reading log**. The core loop:

1. You read a passage.
2. You record a short voice memo (or type a note) about it.
3. The app live-transcribes your speech, cleans up the transcript, and figures
   out which passage you were talking about ("Romans 8:1-11").
4. The log lands in your personal archive, optionally shared into one or more
   small group chats (iMessage-style bubbles, hearts, replies).
5. If the passage matches the next unread day of your selected reading plan,
   that day is automatically marked complete — by a database trigger, not
   application code.

It is a personal-scale app (a handful of users, one Supabase free-tier
project) and several design decisions only make sense with that in mind —
they are called out below.

There are five screens:

| Route | Screen |
| --- | --- |
| `/` | Home — your chat list, the record/type buttons, "Next reading" prompt |
| `/chat/[id]` | A group chat; also the target of shareable join links |
| `/archive` | Your personal log, newest first |
| `/plan` | Reading-plan picker + the plan's day-by-day progress |
| `/account` | Display name, Bible translation for links, log out |
| `/login` | Username + password (sign-in and sign-up are the same form) |

---

## 2. Stack at a glance

- **Next.js 16** (App Router, React Server Components, Server Actions),
  deployed on **Vercel**. React 19, Tailwind CSS 4, TypeScript.
  ⚠️ This Next.js version has breaking changes relative to older training
  data / tutorials — see `AGENTS.md`; read `node_modules/next/dist/docs/`
  before writing code. Two visible examples: the request gate lives in
  `src/proxy.ts` (exporting `proxy`, not `middleware`), and `params` /
  `searchParams` are Promises.
- **Supabase** — one project provides four services:
  - **Postgres** with Row Level Security (the only authorization layer for
    data access), triggers, and `SECURITY DEFINER` RPC functions,
  - **Auth** (email+password under the hood; the app maps usernames to
    synthetic emails),
  - **Storage** (private `audio-memos` bucket for voice recordings),
  - **Realtime** (`postgres_changes` subscriptions power live chat).
- **Speechmatics** realtime speech-to-text — the browser streams PCM over a
  WebSocket directly to Speechmatics using a short-lived token minted by our
  server.
- **OpenAI Whisper** — fallback transcription when the realtime session fails.
- **Anthropic Claude Haiku** (`claude-haiku-4-5`) — transcript cleanup and
  passage-reference extraction, via two small server routes.

There is **no local Supabase stack and no test suite**; `npm run dev` talks to
the production database. End-to-end verification is a curl-driven flow
documented in `.claude/skills/verify/SKILL.md`.

---

## 3. The big picture

```
┌────────────────────────── Browser (mobile Safari-first) ──────────────────────────┐
│                                                                                   │
│  React client components                                                          │
│   • useVoiceRecorder ──► MediaRecorder (blob)                                     │
│   •                 └──► AudioWorklet PCM ══ WebSocket ══► Speechmatics RT STT    │
│   • supabase-js browser client ── ALL data writes (RLS-enforced) ──►  ┐           │
│   • Realtime subscriptions (chat updates) ◄──────────────────────────┤           │
└──────────────┬────────────────────────────────────────────────────────┼───────────┘
               │ HTTPS                                                  │
┌──────────────▼───────────── Vercel (Next.js 16) ──────────────┐       │
│  src/proxy.ts — session gate on every request (local JWT      │       │
│                 verify via getClaims; refreshes cookies)      │       │
│  RSC pages    — ALL data reads (server-side supabase client)──┼──►    │
│  Server actions — auth, create chat, set plan/translation,    │       │
│                   sign audio URLs                             │       │
│  API routes:                                                  │       │
│   /api/speech/token      ─► Speechmatics (mint 5-min RT key)  │       │
│   /api/speech/transcribe ─► OpenAI Whisper                    │       │
│   /api/transcripts/cleanup ─► Claude Haiku (edit + parse ref) │       │
│   /api/passages/parse    ─► Claude Haiku (parse ref only)     │       │
│   /api/cron/keep-alive   ─► daily ping so Supabase never      │       │
│                             pauses (Vercel cron, CRON_SECRET) │       │
└───────────────────────────────────────────────────────────────┘       │
                                                                        ▼
                              ┌───────────────────── Supabase ─────────────────────┐
                              │ Postgres + RLS + triggers + SECURITY DEFINER RPCs  │
                              │ Auth (ES256 JWTs, JWKS)                            │
                              │ Storage: private "audio-memos" bucket              │
                              │ Realtime: postgres_changes broadcast               │
                              └────────────────────────────────────────────────────┘
```

The single most important architectural split:

- **Reads happen on the server.** Every page is a Server Component
  (`export const dynamic = "force-dynamic"` everywhere — content is
  per-user and cookie-authed, so nothing is static). Pages query Supabase
  with a cookie-authenticated server client and render HTML.
- **Writes happen in the browser.** Logging a reading, sharing to chats,
  reacting, replying — all go straight from the client to Supabase via
  supabase-js, authorized purely by RLS. There is no "API layer" between the
  client and the database for writes; the database's policies *are* the API
  contract. The exceptions are a handful of server actions (login, create
  chat, profile settings) where redirects/cookies are involved.

The API routes exist only where a **server-held secret** is required
(Speechmatics, OpenAI, Anthropic keys, cron secret) — never for database
access.

---

## 4. Repository layout

```
migrations/            SQL history. 0000_baseline.sql = documentation-only
                       snapshot of the full schema (do NOT apply to prod);
                       0001+ were applied by hand/MCP. Fresh DB = 0000 + 0017+.
scripts/seed-reading-plans.mjs   Upserts plan JSONs into the DB (service role).
src/
  proxy.ts             Request gate (Next 16's middleware replacement).
  app/
    page.tsx           Home (server) + _components/home-view.tsx (client)
    _components/       voice-review.tsx, text-composer.tsx (the log overlays)
    _actions/          create-chat.ts, sign-audio.ts
    chat/[id]/         Chat page + chat-view / composer / message-bubble
    archive/           Personal log (streaming/Suspense pattern)
    plan/              Plan picker + progress + in-place log buttons
    account/           Settings; login/ has the auth action
    api/               speech/token, speech/transcribe, transcripts/cleanup,
                       passages/parse, cron/keep-alive
  components/          Shared UI: shell, profile-frame, log-sheet, avatar,
                       audio-play-button, local-time, profile-cookie, …
  lib/
    auth/              session.ts, api.ts, user.ts, username.ts, profile-cookie.ts
    db/                server.ts / client.ts (Supabase factories), insert-log.ts
                       (THE log write path), chats.ts (query shaping)
    audio/             use-voice-recorder.ts (capture state machine), storage.ts
    speech/            speechmatics.ts (realtime session class)
    passage.ts         Canonical Bible book table + deterministic ref parser
    reading-plan.ts    Plan types, bible.com deep links, translation map
  data/reading-plans/  Plan JSON sources (seeded into the DB, not read at runtime)
```

Naming convention: route-private components/actions live in `_components/` /
`_actions/` beside their route; anything shared moves up to `src/components`
or `src/lib`.

---

## 5. Authentication

### Usernames over emails

Supabase Auth wants emails, but the product wants usernames. So
`src/lib/auth/username.ts` maps a normalized username to a **synthetic email**
`<username>@vercel.user`, and that is what gets stored in `auth.users`.
"Confirm email" must be disabled in the Supabase dashboard for this to work.

The login form (`/login`) is both sign-in and sign-up
(`src/app/login/_actions/authenticate.ts`):

1. Try `signInWithPassword`. Success → set the profile cookie → redirect.
2. If the error looks like invalid credentials, try `signUp`. If *that* fails
   with "already exists", the truth is "wrong password" — surface that.
3. On successful signup, upsert the `profiles` row (a DB trigger
   `handle_new_user` also auto-creates it from the email local-part, so the
   upsert is belt-and-braces) and set the profile cookie.

A `?next=` parameter carries the originally requested path through login; it
is sanitized to same-origin paths only (`safeNext` rejects `//evil.com` and
absolute URLs).

### The request gate: `src/proxy.ts`

Every request passes through the proxy (Next 16's evolution of middleware —
the build output lists it as `ƒ Proxy (Middleware)`). It:

- builds a `@supabase/ssr` server client bound to the request cookies,
- calls **`supabase.auth.getClaims()`** — this verifies the JWT **locally**
  against a cached JWKS (the project signs tokens with an asymmetric ES256
  key), refreshing the session only when the access token has expired.
  **Do not replace this with `getUser()`**: that hits the Supabase auth
  server on *every request* and, at one point in this app's history,
  effectively blocked all traffic.
- redirects unauthenticated page requests to `/login?next=…`, returns 401
  JSON for unauthenticated `/api/*` requests, and bounces authenticated users
  off `/login`.

Public paths: `/login`, `/auth`, and `/api/cron` — the cron route must stay
public here because Vercel cron invocations carry no Supabase cookie; it
authenticates itself with `CRON_SECRET` instead.

### Defense in depth: every entry point re-verifies

The proxy is necessary but not sufficient — **server actions POST to the page
route they are rendered on**, so a page's auth cannot be assumed from routing
alone. Therefore:

- Pages and server actions call `requireUser()` (redirects to `/login`) or
  `getSession()` (returns `user: null`, used by streamed pages that decide
  inside Suspense) from `src/lib/auth/session.ts`.
- API routes call `getApiUser()` (`src/lib/auth/api.ts`) and return 401 JSON.

All three use the same local `getClaims()` verification — no per-request
auth-server round trips anywhere in the app.

### The profile cookie (a deliberate, bounded cache)

`src/lib/auth/profile-cookie.ts` defines a **non-httpOnly** JSON cookie
`profile` = `{ id, name, planId? }`. It exists purely for perceived speed:

- Page headers ("**Ben**'s reading log") and the avatar render *instantly* —
  including inside `loading.tsx` skeletons, which read `document.cookie`
  before the server has responded (`CookieDisplayName` / `CookieAvatar` in
  `src/components/profile-cookie.tsx`).
- `/plan` uses the cached `planId` to start fetching the selected plan's
  entries *in parallel with* the profiles-row query instead of after it
  (a guess that is discarded if the cookie turns out stale).

It is display/prefetch data only — the `profiles` row stays authoritative.
It's set on login, deleted on logout, and `ProfileCookieSync` (rendered by
pages that fetched the real row) backfills or corrects it client-side.
`planId` is tri-state: a string means "this plan", `null` means "no plan",
`undefined`/absent means "not known — don't clobber".

---

## 6. Data model

All tables live in Postgres; `migrations/0000_baseline.sql` is the readable,
authoritative snapshot (documentation-only — never apply it to prod).

```
auth.users ──1:1── profiles ──────────────┐ reading_plan_id
                     │                    ▼
                     │            reading_plans ──1:N── reading_plan_entries
                     │                                        ▲ (plan_id, date)
                     │                                        │
                     ├──1:N── reading_plan_progress ──────────┘
                     │           (user_id, plan_id, date), message_id →messages
                     │
                     ├──1:N── messages  ◄────────┐
                     │           │               │
                     │           ├──1:N── reactions (message_id, user_id, emoji)
                     │           └──1:N── replies
                     │                           │
                     ├──1:N── chat_members ──N:1─┼── chats
                     │                           │
                     └── (shared_by) message_shares (message_id, chat_id)
```

### The central design idea: logs, not chat messages

A `messages` row is **a reading log owned by a user** — it does *not* belong
to a chat. Chats see a log only through the **`message_shares`** join table
(`message_id`, `chat_id`, `shared_by`). One log can appear in zero chats
(private archive entry) or several at once, without duplication. This is why
the compose overlays have a "Share With" checklist rather than a "send to
this chat" model, and why deleting a share removes a bubble from a chat
without touching the log.

(`messages` still carries vestigial columns — `chat_id`, `body_text`,
`passage_ref`, `passage_raw`, `audio_url` — from before this redesign
(migration 0001) and before storage paths replaced URLs (0003). They are
never read or written.)

### Table-by-table

- **`profiles`** — 1:1 with `auth.users`. `username` (unique), `display_name`,
  `reading_plan_id` (FK, nullable), `bible_translation` (check-constrained to
  `ESV | NASB | NIV | NKJV | NLT`; note 0018 fixed an original `NASB2020`
  constraint value that silently rejected the app's `NASB`).
- **`chats`** — `name`, `type` (`private | group`; the app only creates
  `group`). Anyone signed in may create one.
- **`chat_members`** — membership plus `last_read_at` (unread tracking,
  0016). No UPDATE policy: `last_read_at` changes only through the
  `mark_chat_read` RPC.
- **`messages`** — the log. Content: `note` (typed) or
  `transcript` + `voice_path` (spoken; path into the storage bucket).
  Passage: `reference` (display string, "John 3:16-18") plus **structured
  columns** `book`, `chapter`, `verse_start`, `verse_end` — these drive the
  reading-plan trigger. `created_tz` records the IANA timezone of the
  author's device so timestamps can be shown as the author experienced them.
  Single-chapter books use the convention `chapter = null` with the verse
  number in `verse_start` ("Jude 5").
- **`message_shares`** — described above; `created_at` orders chat timelines.
- **`reactions`** — PK `(message_id, user_id)`: one reaction per user per
  message (the UI only uses ❤️, toggled by double-tap).
- **`replies`** — threaded text replies to a log.
- **`reading_plans` / `reading_plan_entries`** — a plan is a calendar: one row
  per assigned day with human-readable `begin_chapter`/`end_chapter`
  references ("Genesis 1", "John 1:1"). Three **generated columns** —
  `book_key`, `chapter_start`, `chapter_end` — are parsed in Postgres by
  immutable helper functions (`normalize_book`, `ref_book_key`,
  `ref_chapter`) so the trigger can match logs without string parsing at
  insert time.
- **`reading_plan_progress`** — one row per completed plan day per user,
  keyed `(user_id, plan_id, date)`, with a nullable `message_id` pointing at
  the log that completed it.

### Database triggers

- **`handle_new_user`** (on `auth.users` INSERT) — derives a unique username
  from the email local-part and auto-creates the `profiles` row.
- **`record_reading_plan_progress`** (on `messages` INSERT) — the feature the
  app is named for. If the new log has a `book`, find the author's selected
  plan, and among its entries matching the log's passage (`book_key` equal;
  `chapter` inside `[chapter_start, chapter_end]`, or log has no chapter),
  mark the **earliest not-yet-done day** complete — at most one day per log.
  Because this is a trigger, *every* write path (voice, text, chat composer)
  gets plan tracking for free; the client just calls `router.refresh()`
  afterward so the server re-renders "Next reading".

One invariant to protect: the lowercased names in `BIBLE_BOOKS`
(`src/lib/passage.ts`) must agree with Postgres's `normalize_book` output, or
logs stop counting toward plans. Both sides also share the aliases
`psalm→psalms` and `song of songs→song of solomon`.

---

## 7. Row Level Security — the actual authorization layer

Because clients write directly to Postgres, **RLS policies are the app's
entire server-side authorization**. The full set is in `0000_baseline.sql`;
the shape:

| Table | SELECT | INSERT | DELETE/UPDATE |
| --- | --- | --- | --- |
| profiles | everyone | own row | update own |
| chats | members only | any signed-in user | — |
| chat_members | members only | self only | self (leave) |
| messages | owner **or** shared-into-your-chat | own only | own only |
| message_shares | chat members | owner of the message ∧ member of the chat | sharer |
| reactions / replies | everyone | self-attributed | own (reactions) |
| reading_plan_* | authenticated (plans/entries); own rows (progress) | own | own |

Four hard-won lessons are baked into this schema:

1. **Recursion breaking.** "Members can read `chats`" needs `chat_members`;
   "members can read `chat_members`" needs… `chat_members`. Same for
   `messages` ↔ `message_shares`. Postgres RLS recurses and errors. The fix
   (0005, 0014): tiny **`SECURITY DEFINER` helper functions** —
   `is_chat_member`, `user_owns_message`, `message_shared_to_user` — that
   bypass RLS for the inner existence check while policies stay declarative.

2. **`TO public`, not `TO authenticated`.** In this database, policies
   created `TO authenticated` stopped matching (the role OID recorded at
   policy-creation time no longer matched the live role — see 0009). App
   tables therefore write policies as `TO public` and gate on `auth.uid()`
   (which is NULL for anonymous callers, so the effect is identical).

3. **`INSERT … RETURNING` evaluates the SELECT policy on the new row.**
   supabase-js `.insert().select()` fails unless the creator can already
   *see* the row. Fine for `messages` (owner passes `user_id = auth.uid()`);
   fatal for `chats` (the creator isn't a member until the *next* insert).
   Hence `create-chat.ts` generates the chat's UUID locally and inserts
   without RETURNING, then inserts its own membership.

4. **Cross-request visibility is not instant when RLS depends on prior
   writes.** The share-link join flow originally did "insert membership,
   then read the chat" as separate queries and hit both RLS timing and
   Next's per-render GET memoization. The fix (0015) is a single
   **`join_chat_via_link(chat_id)`** `SECURITY DEFINER` RPC: idempotently
   self-join, then return the chat row, in one POST.

Other RPCs (all `SECURITY DEFINER`, all keyed on `auth.uid()` internally):
`mark_chat_read` (bumps `last_read_at`), `chat_summaries_for_me` (0017 —
per-chat newest-share timestamp + unread flag in one aggregate, replacing an
O(all shares) scan the home page used to do), and the superseded
`unread_chat_ids_for_me` (kept until no deployed client calls it).

### Storage policies

The `audio-memos` bucket is **private** (0003). Objects live at
`{userId}/{uuid}.{webm|m4a}`. Policies: users write/delete only inside their
own folder; **read** is "owner, or member of any chat the memo's message was
shared into" — implemented as a SQL join from `storage.objects.name` through
`messages.voice_path` → `message_shares` → `chat_members`. (0017 added a
partial index on `messages(voice_path)` because that join runs on every
signed-URL mint.)

---

## 8. The logging pipeline (the heart of the app)

### 8.1 Recording — `src/lib/audio/use-voice-recorder.ts`

A client hook owning the capture state machine; three UIs render it (home
screen, plan page, chat composer). On `start()`:

1. **Token first, in parallel**: POST `/api/speech/token` fires immediately
   so the 5-minute Speechmatics key is usually ready before it's needed.
2. `getUserMedia({ audio: true })` (the mic permission prompt).
3. **Speechmatics audio path is prepared *before* MediaRecorder starts.**
   On iOS, attaching an AudioContext to a mic stream briefly reconfigures
   the audio session and drops a few milliseconds of samples; doing it first
   keeps that glitch out of the recorded file.
4. `MediaRecorder` starts at **32 kbps mono** (voice is intelligible there,
   and storage egress is billed — see §12). iOS Safari emits `audio/mp4`,
   others `audio/webm`; the file extension is chosen to match
   (`voiceExtension`) because Whisper detects format by filename.
5. The Speechmatics WebSocket connects (`connectClient`) and PCM starts
   flowing; audio captured during the handshake is buffered and flushed.

`SpeechmaticsSession` (`src/lib/speech/speechmatics.ts`) wraps the vendor
client: an inline **AudioWorklet** (loaded from a Blob URL, so no static
asset) converts the stream to Int16 PCM; partial and final transcript
segments accumulate and stream to callbacks. The transcription config biases
recognition with an **`additional_vocab` list of all 66 Bible book names**,
with `sounds_like` entries only for the ones that actually get misheard
("Habakkuk", "first corinthians", …) since vocab size costs startup latency.

Failure at any stage (token, handshake, socket error) flips
`realtimeFailedRef`; the transcript state **downgrades from `""`/text to
`null`**, which is the signal to downstream code that Whisper must transcribe
the finished blob instead. The recording itself never depends on
Speechmatics being up.

On `stop()`, the UI moves on immediately with the partials shown so far while
the session's final segments settle in the background (`liveTranscribing`).

### 8.2 Review — `src/app/_components/voice-review.tsx`

The full-screen sheet where a voice log is finalized (home and plan flows).
What happens, in order:

- The blob is decoded into an AudioBuffer for local preview playback.
- If realtime failed: the blob goes to POST `/api/speech/transcribe`
  (Whisper; one retry) and the transcript fills in.
- Once the transcript settles, **one** POST to `/api/transcripts/cleanup`
  does double duty (single Haiku call): lightly edit the transcript
  (fillers, restarts, punctuation, digit-ify spoken numbers, fix obvious
  mishearings — the prompt is explicit that meaning must not change) *and*
  extract the passage into structured fields. The route defends itself:
  strips code fences, validates JSON field types, and — the key guard — if
  the "cleaned" text is drastically shorter than the input it assumes the
  model summarized and **keeps the original text** (while still using the
  parsed reference).
- The **Log button is held** ("Transcribing…" → "Polishing…") until cleanup
  settles, so a log never lands in the archive missing a reference the model
  was about to find. A 20-second client-side abort stops a hung call from
  holding the button hostage.
- User edits win: editing the transcript or reference field sets refs that
  stop the model results from overwriting them. A reference prefilled from a
  plan day (see §10) is treated as user-edited from the start.
- On send, a hand-edited reference is validated by the **deterministic**
  parser `parseReferenceInput` (`src/lib/passage.ts` — book aliases,
  ordinal prefixes, chapter/verse ranges, per-book chapter-count checks) and
  rebuilt into structured fields; then §8.4 runs.

The typed-note path (`text-composer.tsx`) is the same sheet minus audio: the
reference comes *only* from the reference field via `parseReferenceInput` —
the note body is never sent to any AI service.

### 8.3 The chat composer variant — `src/app/chat/[id]/_components/composer.tsx`

Chat has no review screen; a voice memo sends itself when transcription
settles. Differences:

- While the transcript streams, the composer **debounce-parses (500 ms)** via
  POST `/api/passages/parse` (Haiku, parse-only prompt with a `matched_text`
  contract) so the reference is usually known before the memo is sent; first
  successful parse wins.
- `applyReferenceReplacement` swaps the verbatim `matched_text` span in the
  transcript for the canonical reference — with a guard refusing any span
  that crosses a sentence boundary (collapsing "Matthew 4 today.
  Specifically verse 6" into "Matthew 4:6" would change meaning).
- Typed chat messages are parsed the same way; typed *replies* to a bubble
  insert into `replies` instead and skip parsing entirely.

### 8.4 The write — `src/lib/db/insert-log.ts`

**Every log, from every surface, is written by `insertLogWithShares`.** It:

1. inserts the `messages` row (`.select("id")` RETURNING is safe here — the
   owner passes the SELECT policy),
2. fires the optional `onInserted(id)` callback **between** the message
   insert and the share inserts — the chat composer reconciles its
   optimistic bubble's temp id to the real id here, so when the share INSERT
   arrives on the realtime channel the dedupe already recognizes it
   (otherwise the bubble would double for a moment),
3. inserts the `message_shares` rows for the selected chats.

Voice memos are uploaded first (`uploadVoiceBlob` →
`{userId}/{uuid}.{ext}`), and the path goes into the row. The DB trigger then
does plan-progress matching (§6), and the caller runs `router.refresh()` so
server-rendered bits (next reading, chat ordering) update.

```
record → stream STT → review sheet → cleanup+parse (Haiku)
   │                                        │
   └── blob → Storage upload ──┐            ▼
                               ├─► insertLogWithShares ─► messages + message_shares
   typed note → parse ref ─────┘            │                    │
                                            ▼                    ▼
                              trigger: record_reading_plan_progress   realtime → chat UIs
```

---

## 9. Chats and realtime

### Page load — `src/app/chat/[id]/page.tsx`

Visiting a chat URL *is* the join flow: the page calls the
`join_chat_via_link` RPC (idempotent self-join + fetch chat row, §7), which
makes every chat URL a shareable invite link for signed-in users. Then, in
parallel: `mark_chat_read`, the member list, the viewer's translation
preference, and the timeline — `message_shares` for the chat joined to the
full message (author profile, reactions, replies), ordered by share time,
capped at 200. Voice-memo paths are signed in one batch
(`createSignedUrls`, 1-hour TTL) because chat bubbles need playable audio
immediately.

### Live updates — `chat-view.tsx`

Two Supabase Realtime channels per open chat:

- **`chat:{id}`** — `message_shares` INSERT/DELETE filtered by
  `chat_id=eq.{id}`. An INSERT payload carries only ids, so the handler
  fetches the full message (and signs its audio) before appending; a dedupe
  guard tolerates the author's own optimistic copy.
- **`chat-meta:{id}`** — reactions and replies. Realtime INSERT filters only
  support `in.(…)` with ≤100 values, so the channel subscribes to the
  **newest 100 real message ids** and re-subscribes when that set changes
  (a sub-second gap, acceptable at this scale; the file notes
  `realtime.broadcast_changes()` as the upgrade path). Reaction DELETEs
  can't be filtered at all, so that handler is table-wide and matches
  client-side.

Unread state: `chat_members.last_read_at` vs. share timestamps, computed
per-chat by the `chat_summaries_for_me` aggregate on the home page (blue dot
+ list ordering), and reset by `mark_chat_read` on chat open.

The bubbles themselves (`message-bubble.tsx`) implement mobile chat idioms by
hand with pointer events: swipe-right to set the reply target (with
threshold, clamp, and haptic), double-tap to toggle the ❤️ reaction, and
`React.memo` so a realtime update re-renders only the touched bubble.

---

## 10. Reading plans

- **Source of truth for content**: JSON files in `src/data/reading-plans/`
  (see the README there for the format). `npm run seed:plans` upserts them
  into `reading_plans` / `reading_plan_entries` using the **service-role
  key** from `.env.local` — the only place that key is ever used; it never
  appears in `src/`.
- **Selection**: `profiles.reading_plan_id`, set by tapping a plan on `/plan`
  (server action `setReadingPlan`, which also updates the profile cookie's
  `planId` so the prefetch guess stays warm).
- **Progress**: written exclusively by the DB trigger (§6). "Next reading"
  is simply the earliest entry without a progress row — computed on the home
  page and on `/plan`.
- **The plan page** lists every entry: completed days show the completing
  log (with its audio button); the next unread day gets inline record/type
  buttons (`plan-log-buttons.tsx`) that run the exact same VoiceReview /
  TextComposer overlays with the reference **prefilled from the plan entry**
  (authoritative — the model's parse won't overwrite it), so one tap logs
  precisely the day you're on.
- **Deep links**: entries link to bible.com chapters
  (`https://www.bible.com/bible/{versionId}/{USFM}.{chapter}[.v[-v]]`),
  using the USFM codes in `BIBLE_BOOKS` and the viewer's
  `bible_translation` mapped to bible.com version ids
  (`src/lib/reading-plan.ts`). Log references in chat/archive get the same
  treatment via `bibleComUrlForReference`.

---

## 11. API routes

All routes check auth themselves (`getApiUser` → 401 JSON), cap input sizes,
export `maxDuration` (Vercel Hobby's default is short), and **fail soft**
where the product allows it — a dead AI service degrades to "raw transcript,
type your own reference", never a blocked send.

| Route | Purpose | Guards |
| --- | --- | --- |
| `POST /api/speech/token` | Mint a 300 s Speechmatics realtime key | 8 s upstream timeout; reads `SPEECHMATICS_API_KEY` (falls back to the legacy misspelled `SPEECHMATIC_API_KEY` until the Vercel env var is renamed) |
| `POST /api/speech/transcribe` | Whisper fallback transcription | 25 MB cap (Whisper's own limit; a 32 kbps memo is ~2.4 MB per 10 minutes, so this only stops abuse) |
| `POST /api/transcripts/cleanup` | Haiku: edit transcript + extract passage (one call) | 20 k chars; JSON validation; length-ratio guard returns original text |
| `POST /api/passages/parse` | Haiku: extract passage + `matched_text` only | 10 k chars; errors return a null passage with 200 |
| `GET /api/cron/keep-alive` | Daily PostgREST ping so the free-tier project never hits the 7-day pause | `Authorization: Bearer CRON_SECRET`; scheduled in `vercel.json` (12:00 UTC); exempt from the proxy gate |

The AI routes are authenticated but **not rate-limited per user** — accepted
because account creation is the only exposure and accounts are personal-scale.

---

## 12. Audio storage economics

A prior incident (storage egress bills from repeated audio fetches) shaped
several rules that look odd without the backstory:

- Memos are recorded at **32 kbps mono** — small files are the first defense.
- The bucket is **private**; audio is served via **signed URLs (1 h TTL)**.
- Archive and plan pages **sign on tap, not on render**: the play button
  calls the `signAudio` server action the first time it's pressed
  (`archive-audio-button.tsx`), so listing 200 logs mints zero URLs. Chat
  pre-signs (bubbles are expected to be played), but every `<audio>` element
  is `preload="none"` — even a CDN cache hit bills as egress.
- **Audio is never deleted** (accepted risk: ~72 h of audio fits the 1 GB
  free cap; years away at personal volume). When deletion does happen, it
  must go through the **Storage API, never SQL** — SQL deletes leave
  orphaned objects that still bill.

---

## 13. Frontend architecture and conventions

- **RSC-first**: pages are server components that fetch and pass plain
  props; interactivity lives in `"use client"` leaves. No client-side data
  fetching library — the browser Supabase client is used for writes and
  realtime only.
- **Streaming skeletons**: `/archive` and `/plan` create their data promise
  *before* returning JSX and await it inside `<Suspense>`, so the frame
  (header, tabs) streams instantly while queries run; the profile cookie
  fills the name/avatar even in `loading.tsx`. Queries that don't depend on
  each other run under `Promise.all`, and `/plan` overlaps a cookie-guessed
  plan fetch with the profile read (§5).
- **The Shell** (`src/components/shell.tsx`) has two flow modes: `viewport`
  (fixed 100dvh, body scrolls internally — home, chat) and `document` (page
  scrolls — archive/plan/account, so iOS Safari lets content slide under its
  translucent URL bar). Header/Body/Footer are wrapped in **React
  `ViewTransition`** (experimental flag in `next.config.ts`) with stable
  names so cross-page navigation morphs instead of flashing. Archive, plan,
  and account share the `ProfileFrame` chrome so they read as three tabs of
  one profile page.
- **Timezone correctness**: server HTML must not contain viewer-local times
  (server timezone ≠ viewer timezone = hydration mismatch). `useHydrated` /
  `LocalTime` render timestamps only after hydration, and `messages.created_tz`
  lets a log display in the *author's* timezone ("logged at 7 am their time")
  rather than the viewer's.
- **Optimistic UI** only where latency hurts: the chat composer inserts a
  `tmp-` bubble, reconciled via the `onInserted` hook (§8.4). Elsewhere the
  app just awaits the insert and `router.refresh()`es.
- Mobile-first, dark-only (`<html class="dark">`, no theme switch), no UI
  component library — hand-rolled Tailwind. Avatars are deterministic: a
  palette color hashed from the user id plus the display-name initial, so
  they render identically from cookie or database with no image storage.

---

## 14. Operations

- **Environment variables** — see the README table. Summary:
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client+server),
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SPEECHMATICS_API_KEY`,
  `CRON_SECRET` (server), `SUPABASE_SERVICE_ROLE_KEY` (`.env.local` only,
  seeding only).
- **Migrations** are a paper trail, not a pipeline: `0001+` were applied by
  hand or via the Supabase MCP in order; `0000_baseline.sql` documents the
  dashboard-created base schema. Rebuild-from-scratch recipe: apply 0000,
  then 0017+. The history (0004–0011 especially) is worth skimming — it
  records the RLS debugging journey that produced the §7 patterns.
- **Development runs against the production Supabase project** (`npm run
  dev`) — there is no local stack. Be careful; prefer the curl-driven
  verification flow in `.claude/skills/verify/SKILL.md` (login, page
  fetches, server-action invocation, test-user cleanup) for end-to-end
  checks. `certificates/` + `allowedDevOrigins` in `next.config.ts` support
  HTTPS dev serving on the LAN so a phone can exercise mic capture (which
  requires a secure context).
- **Keep-alive**: Vercel cron hits `/api/cron/keep-alive` daily so the
  Supabase free-tier project never pauses for inactivity.

## 15. Sharp edges checklist

The short list of things most likely to bite a newcomer:

1. `getClaims()`, never `getUser()`, in the proxy and session helpers (§5).
2. `/api/cron` must stay in the proxy's public list (§5).
3. `.insert().select()` requires the creator to pass the row's SELECT
   policy — fine for `messages`, not for `chats` (§7).
4. New RLS policies: `TO public` + `auth.uid()` gate, not `TO authenticated`
   (§7); break table-pair recursion with `SECURITY DEFINER` helpers.
5. All log writes go through `insertLogWithShares` — don't add a fourth
   write path (§8.4).
6. Book names in `BIBLE_BOOKS` must match Postgres `normalize_book`, or plan
   tracking silently stops (§6).
7. Single-chapter books: `chapter = null`, verse in `verse_start` (§6).
8. Audio: sign on tap, `preload="none"`, delete only via the Storage API (§12).
9. Viewer-local times render post-hydration only; author times use
   `created_tz` (§13).
10. This is Next.js 16 — check `node_modules/next/dist/docs/` before assuming
    an API from memory (§2).
