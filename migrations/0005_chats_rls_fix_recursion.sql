-- Fix infinite recursion in chat_members RLS.
-- The previous "members read members" policy queried chat_members from within
-- a policy on chat_members itself, which re-entered RLS and looped.
-- We isolate the membership check in a SECURITY DEFINER function that bypasses RLS.

create or replace function public.is_chat_member(p_chat_id uuid, p_user_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from chat_members
    where chat_id = p_chat_id and user_id = p_user_id
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

-- Rewrite policies to use the helper.

drop policy if exists "members read chats" on chats;
create policy "members read chats"
  on chats for select
  to authenticated
  using (public.is_chat_member(id, auth.uid()));

drop policy if exists "members read members" on chat_members;
create policy "members read members"
  on chat_members for select
  to authenticated
  using (public.is_chat_member(chat_id, auth.uid()));
