-- Atomic "follow a share link" RPC.
--
-- The previous flow in src/app/chat/[id]/page.tsx did:
--   SELECT chats WHERE id = $1     -- null: invitee not yet a member, RLS hides it
--   INSERT chat_members            -- self-join
--   SELECT chats WHERE id = $1     -- expected to now return the row
--
-- Two issues bit at once:
--   1. Next.js memoizes identical GET fetches inside one render pass, so the
--      second SELECT was deduplicated to the first null result. Page rendered
--      "Chat not found" while the membership row was real (chat appeared in
--      the visitor's /chats list afterwards).
--   2. Even with that fixed, the multi-step flow leaks RLS edge cases — any
--      future tweak to is_chat_member or the chats SELECT policy could quietly
--      break the post-insert re-read.
--
-- Collapse it into one SECURITY DEFINER function: idempotent insert + read,
-- one round trip, no RLS gymnastics. Returns an empty rowset if the chat id
-- doesn't exist or the caller is anonymous.

create or replace function public.join_chat_via_link(p_chat_id uuid)
  returns table (id uuid, name text)
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

  if not exists (select 1 from chats c where c.id = p_chat_id) then
    return;
  end if;

  insert into chat_members (chat_id, user_id)
  values (p_chat_id, v_user_id)
  on conflict do nothing;

  return query
    select c.id, c.name from chats c where c.id = p_chat_id;
end;
$$;

revoke all on function public.join_chat_via_link(uuid) from public;
grant execute on function public.join_chat_via_link(uuid) to authenticated;
