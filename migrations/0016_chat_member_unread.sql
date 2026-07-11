-- Per-member read tracking for the homepage unread dot.
--
-- HomeView already renders an UnreadDot per chat from ChatSummary.hasUnread,
-- but the value was hardcoded false because no read state existed in the DB.
--
-- Design:
--   * One column on chat_members tracks when the user last "saw" the chat.
--   * A chat is unread iff some message_shares row in it is newer than
--     last_read_at AND was authored by someone other than the viewing user
--     (a user's own posts should never dot their own homepage).
--   * Both the read-marking and unread-lookup go through SECURITY DEFINER
--     RPCs (same pattern as is_chat_member, join_chat_via_link) so we avoid
--     opening up UPDATE on chat_members via a new RLS policy.
--
-- Existing chat_members rows backfill to now() so the rollout doesn't dot
-- every chat for every user. New rows (chat creation, share-link join) pick
-- up the same default.

alter table chat_members
  add column if not exists last_read_at timestamptz not null default now();

-- ---------- mark_chat_read ----------

create or replace function public.mark_chat_read(p_chat_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  update chat_members
    set last_read_at = now()
    where chat_id = p_chat_id
      and user_id = v_user_id;
end;
$$;

revoke all on function public.mark_chat_read(uuid) from public;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- ---------- unread_chat_ids_for_me ----------

create or replace function public.unread_chat_ids_for_me()
  returns setof uuid
  language sql
  security definer
  set search_path = public
as $$
  select cm.chat_id
  from chat_members cm
  where cm.user_id = auth.uid()
    and exists (
      select 1
      from message_shares ms
      join messages m on m.id = ms.message_id
      where ms.chat_id = cm.chat_id
        and m.user_id <> auth.uid()
        and ms.created_at > cm.last_read_at
    );
$$;

revoke all on function public.unread_chat_ids_for_me() from public;
grant execute on function public.unread_chat_ids_for_me() to authenticated;

notify pgrst, 'reload schema';
