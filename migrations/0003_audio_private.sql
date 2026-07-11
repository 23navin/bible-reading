-- Lock down audio-memos. Run in Supabase Dashboard -> SQL Editor.
-- Assumes you've already run 0001 and 0002.

-- 1. Make the bucket private.
update storage.buckets set public = false where id = 'audio-memos';

-- 2. Drop the wide-open read policy from 0002.
drop policy if exists "audio-memos: public read" on storage.objects;

-- 3. Ensure messages has a voice_path column (the storage object path, e.g. `uid/file.webm`).
--    Signed URLs are minted at render time. If your schema had a different audio column
--    (voice_url, audio_url, etc.), it's left alone — you can drop it later.
alter table messages
  add column if not exists voice_path text;

-- 4. Read policy: authenticated user may read an audio object if
--    (a) they own it (folder is their uid), OR
--    (b) it's referenced by a message that's been shared into a chat they're a member of.
drop policy if exists "audio-memos: owner or chat-mate read" on storage.objects;
create policy "audio-memos: owner or chat-mate read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio-memos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from messages m
        join message_shares ms on ms.message_id = m.id
        join chat_members  cm on cm.chat_id   = ms.chat_id
        where m.voice_path = name
          and cm.user_id = auth.uid()
      )
    )
  );
