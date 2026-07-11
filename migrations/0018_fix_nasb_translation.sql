-- The app has always sent 'NASB' (BIBLE_TRANSLATIONS in src/lib/reading-plan.ts;
-- its bible.com version id 2692 is the NASB 2020 text), but the profiles
-- check constraint was created with 'NASB2020' — so picking NASB in the
-- account page never saved, and before the actions surfaced errors it failed
-- silently. No profile row stores 'NASB2020' (verified 2026-07-11), so
-- swapping the allowed value is safe.

alter table public.profiles
  drop constraint profiles_bible_translation_check;

alter table public.profiles
  add constraint profiles_bible_translation_check
  check (bible_translation in ('ESV', 'NASB', 'NIV', 'NKJV', 'NLT'));
