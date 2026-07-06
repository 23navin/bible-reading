# Reading plans

The JSON files in this directory are the source of truth for reading plans.
The app reads plans from the database (`reading_plans` + `reading_plan_entries`
tables), so after adding or editing a file re-seed with `npm run seed:plans`
(upserts every JSON here; needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).

Format (calendar-based; entries are the days the plan assigns a reading):

```json
{
  "id": "rc-26",
  "display_name": "Redwood Chapel Reading Plan",
  "description": "One paragraph shown in settings.",
  "entries": [
    {
      "date": "2026-01-05",
      "begin_chapter": "Genesis 1",
      "end_chapter": "Genesis 1",
      "description": "Week theme, memory verse, etc."
    },
    {
      "date": "2026-01-08",
      "begin_chapter": "John 1:1",
      "end_chapter": "John 1:18",
      "description": "…"
    }
  ]
}
```

- `id` — stable slug; referenced by `profiles.reading_plan_id`.
- `date` — ISO `yyyy-mm-dd`; at most one entry per date per plan.
- `begin_chapter` / `end_chapter` — human-readable references. Equal values
  mean a single chapter/passage; verse-level bounds like `John 1:1` →
  `John 1:18` are allowed. Single-chapter books may omit the chapter number
  (e.g. `Jude`).
- `description` — optional free text (week theme, memory verse, Christ
  connection) attached to that day.

## Progress tracking

`reading_plan_entries` has generated columns (`book_key`, `chapter_start`,
`chapter_end`) parsed in Postgres from the reference strings. Per-user
progress lives in `reading_plan_progress` — one row per completed plan day,
keyed `(user_id, plan_id, date)`, with a nullable `message_id` linking the day
to the log that completed it. Rows are written automatically by a database
trigger on `messages` (`record_reading_plan_progress`): when a log with a
parsed passage is inserted, the earliest unread day of the author's selected
plan that matches the passage (same book, chapter inside the entry's range)
is marked complete. The home screen's "Next reading" is simply the earliest
entry without a progress row.
