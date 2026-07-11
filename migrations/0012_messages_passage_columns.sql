-- Add the passage / note / transcript columns the recorder and chat composer write to.
-- HomeRecorder and Composer insert these; ChatView selects them.
-- Run in Supabase Dashboard -> SQL Editor.

alter table messages
  add column if not exists note        text,
  add column if not exists transcript  text,
  add column if not exists reference   text,
  add column if not exists book        text,
  add column if not exists chapter     int,
  add column if not exists verse_start int,
  add column if not exists verse_end   int;

notify pgrst, 'reload schema';
