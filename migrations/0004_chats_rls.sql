-- Allow authenticated users to create chats and join themselves to chats.
-- Run in Supabase Dashboard -> SQL Editor.

-- 1. CHATS
-- Anyone signed in can create a chat.
drop policy if exists "auth can create chats" on chats;
create policy "auth can create chats"
  on chats for insert
  to authenticated
  with check (auth.uid() is not null);

-- Members of a chat can read it.
drop policy if exists "members read chats" on chats;
create policy "members read chats"
  on chats for select
  to authenticated
  using (
    id in (select chat_id from chat_members where user_id = auth.uid())
  );

-- 2. CHAT_MEMBERS
-- A user may add themselves to any chat (covers the "I just created this chat, now add me" step).
-- Inviting others would be a separate flow (e.g., invite tokens). For now we only permit self-add.
drop policy if exists "self add to chat" on chat_members;
create policy "self add to chat"
  on chat_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- A user may see the members of any chat they themselves belong to.
drop policy if exists "members read members" on chat_members;
create policy "members read members"
  on chat_members for select
  to authenticated
  using (
    chat_id in (select chat_id from chat_members where user_id = auth.uid())
  );

-- A user may leave a chat (delete their own membership).
drop policy if exists "self leave chat" on chat_members;
create policy "self leave chat"
  on chat_members for delete
  to authenticated
  using (user_id = auth.uid());
