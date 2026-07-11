-- Final RLS for chats / chat_members.
-- The `TO authenticated` role match was failing in this database (policy-creation
-- resolved `authenticated` to an OID that no longer matches the current role).
-- We side-step the problem by writing all policies as `TO public` and gating on
-- `auth.uid()` (which is NULL for anonymous requests).

-- ---------- Clean slate on chats ----------
drop policy if exists "auth can create chats" on chats;
drop policy if exists "members read chats"    on chats;
drop policy if exists "everyone all access"   on chats;
drop policy if exists "Members can read their chats" on chats;

alter table chats enable row level security;

create policy "chats: signed-in can insert"
  on chats for insert
  to public
  with check (auth.uid() is not null);

create policy "chats: members can read"
  on chats for select
  to public
  using (public.is_chat_member(id, auth.uid()));

-- ---------- Clean slate on chat_members ----------
drop policy if exists "self add to chat"   on chat_members;
drop policy if exists "members read members" on chat_members;
drop policy if exists "self leave chat"    on chat_members;

alter table chat_members enable row level security;

create policy "chat_members: self add"
  on chat_members for insert
  to public
  with check (user_id = auth.uid());

create policy "chat_members: members read"
  on chat_members for select
  to public
  using (public.is_chat_member(chat_id, auth.uid()));

create policy "chat_members: self leave"
  on chat_members for delete
  to public
  using (user_id = auth.uid());

-- ---------- Tear down debug helpers ----------
drop function if exists public.debug_auth();
drop function if exists public.debug_create_chat();
