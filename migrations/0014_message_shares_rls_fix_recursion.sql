-- Fix infinite recursion in message_shares / messages RLS.
--
-- The previous policies cross-referenced each other:
--   - messages SELECT ("own or shared messages") subselected from message_shares
--   - message_shares INSERT WITH CHECK subselected from messages
-- Expanding either policy made Postgres re-enter the other table's policies,
-- which closes a cycle in the policy graph -> "infinite recursion detected".
--
-- Same pattern as 0005 (chats / chat_members): isolate the lookups inside
-- SECURITY DEFINER helpers so RLS expansion stops at the function boundary.
--
-- This migration also drops the stale pre-redesign policies on messages that
-- still keyed off messages.chat_id. After 0001 we stopped populating that
-- column, so those policies block legitimate reads/inserts.

-- ---------- Helpers ----------

create or replace function public.user_owns_message(p_message_id uuid, p_user_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from messages
    where id = p_message_id and user_id = p_user_id
  );
$$;

revoke all on function public.user_owns_message(uuid, uuid) from public;
grant execute on function public.user_owns_message(uuid, uuid) to authenticated;

create or replace function public.message_shared_to_user(p_message_id uuid, p_user_id uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from message_shares ms
    join chat_members cm
      on cm.chat_id = ms.chat_id
    where ms.message_id = p_message_id
      and cm.user_id = p_user_id
  );
$$;

revoke all on function public.message_shared_to_user(uuid, uuid) from public;
grant execute on function public.message_shared_to_user(uuid, uuid) to authenticated;

-- ---------- message_shares ----------

alter table message_shares enable row level security;

drop policy if exists "members read shares"       on message_shares;
drop policy if exists "owners share own messages" on message_shares;
drop policy if exists "owners unshare"            on message_shares;

create policy "message_shares: members read"
  on message_shares for select
  to public
  using (public.is_chat_member(chat_id, auth.uid()));

create policy "message_shares: owners share"
  on message_shares for insert
  to public
  with check (
    shared_by = auth.uid()
    and public.user_owns_message(message_id, auth.uid())
    and public.is_chat_member(chat_id, auth.uid())
  );

create policy "message_shares: owners unshare"
  on message_shares for delete
  to public
  using (shared_by = auth.uid());

-- ---------- messages ----------

alter table messages enable row level security;

-- Stale pre-redesign policies keyed on messages.chat_id (now unused/NULL).
drop policy if exists "Members can read messages"   on messages;
drop policy if exists "Members can insert messages" on messages;

-- Redesign-era policies, re-created to break the recursion cycle.
drop policy if exists "own or shared messages" on messages;
drop policy if exists "insert own messages"    on messages;
drop policy if exists "update own messages"    on messages;
drop policy if exists "delete own messages"    on messages;

create policy "messages: own or shared"
  on messages for select
  to public
  using (
    user_id = auth.uid()
    or public.message_shared_to_user(id, auth.uid())
  );

create policy "messages: insert own"
  on messages for insert
  to public
  with check (user_id = auth.uid());

create policy "messages: update own"
  on messages for update
  to public
  using (user_id = auth.uid());

create policy "messages: delete own"
  on messages for delete
  to public
  using (user_id = auth.uid());
