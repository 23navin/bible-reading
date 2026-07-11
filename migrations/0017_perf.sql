-- Query-performance pass.
--
-- 1) chat_summaries_for_me(): the home page needs, per chat, the newest
--    share timestamp (list ordering) and an unread flag. It previously called
--    unread_chat_ids_for_me() AND fetched every message_shares row of every
--    joined chat just to keep the first per chat in JS — O(all shares) rows
--    per home load. One aggregate returns both values in a single round trip.
--    Same SECURITY DEFINER pattern as 0016.
--
--    unread_chat_ids_for_me() is superseded but intentionally kept: the
--    deployed app still calls it until the release that ships this migration.
--    Safe to drop in a later migration.
--
-- 2) Indexes for joins the base schema never covered:
--    * messages(voice_path) — the audio-memos SELECT policy (0003) joins
--      messages on voice_path for EVERY signed-URL mint.
--    * messages(user_id, created_at) — the archive lists a user's messages
--      newest-first.
--    * replies(message_id) — the chat page's nested replies select; replies
--      only had its id primary key.
--    (reactions(message_id) is already covered by its (message_id, user_id)
--    primary key, and message_shares(chat_id, created_at) exists since 0001.)

create or replace function public.chat_summaries_for_me()
  returns table (chat_id uuid, last_message_at timestamptz, has_unread boolean)
  language sql
  security definer
  set search_path = public
as $$
  select cm.chat_id,
         max(ms.created_at) as last_message_at,
         coalesce(
           bool_or(ms.created_at > cm.last_read_at and m.user_id <> auth.uid()),
           false
         ) as has_unread
  from chat_members cm
  left join message_shares ms on ms.chat_id = cm.chat_id
  left join messages m on m.id = ms.message_id
  where cm.user_id = auth.uid()
  group by cm.chat_id, cm.last_read_at;
$$;

revoke all on function public.chat_summaries_for_me() from public;
grant execute on function public.chat_summaries_for_me() to authenticated;

create index if not exists messages_voice_path_idx
  on public.messages (voice_path)
  where voice_path is not null;

create index if not exists messages_user_created_idx
  on public.messages (user_id, created_at desc);

create index if not exists replies_message_id_idx
  on public.replies (message_id);

notify pgrst, 'reload schema';
