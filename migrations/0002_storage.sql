-- Storage bucket for voice memos. Run in Supabase Dashboard -> SQL Editor.

insert into storage.buckets (id, name, public)
values ('audio-memos', 'audio-memos', true)
on conflict (id) do nothing;

-- Authenticated users may upload to a folder named after their auth.uid().
-- HomeRecorder/Composer write paths like `{userId}/{uuid}.webm`, matching this rule.
drop policy if exists "audio-memos: users write own folder" on storage.objects;
create policy "audio-memos: users write own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'audio-memos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read so anyone (incl. unauthenticated) can play the audio via the public URL.
-- If you'd rather keep memos private, drop this policy and switch the app to
-- supabase.storage.createSignedUrl() instead of getPublicUrl() in HomeRecorder.
drop policy if exists "audio-memos: public read" on storage.objects;
create policy "audio-memos: public read"
  on storage.objects for select
  using (bucket_id = 'audio-memos');

-- Owners can delete their own files.
drop policy if exists "audio-memos: owners delete" on storage.objects;
create policy "audio-memos: owners delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'audio-memos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
