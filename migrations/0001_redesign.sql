-- ScriptureShare redesign: archive-first messages, share-into-chats junction, username auth.
-- Run this in Supabase Dashboard -> SQL Editor.

-- 1. Username on profiles (synth email is `{username}@scriptureshare.local`).
alter table profiles
  add column if not exists username text unique;

-- 2. Messages no longer require a chat_id. The message is owned by its author;
--    chats see it only via message_shares. (We leave the column for backwards-compat
--    but stop populating it. Feel free to DROP COLUMN chat_id later.)
alter table messages
  alter column chat_id drop not null;

-- 3. Junction: which messages are shared into which chats.
create table if not exists message_shares (
  message_id uuid not null references messages(id) on delete cascade,
  chat_id    uuid not null references chats(id)    on delete cascade,
  shared_by  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, chat_id)
);

create index if not exists message_shares_chat_idx on message_shares(chat_id, created_at desc);

-- 4. RLS for message_shares.
alter table message_shares enable row level security;

drop policy if exists "members read shares" on message_shares;
create policy "members read shares" on message_shares
  for select
  using (
    chat_id in (select chat_id from chat_members where user_id = auth.uid())
  );

drop policy if exists "owners share own messages" on message_shares;
create policy "owners share own messages" on message_shares
  for insert
  with check (
    shared_by = auth.uid()
    and message_id in (select id from messages where user_id = auth.uid())
    and chat_id in (select chat_id from chat_members where user_id = auth.uid())
  );

drop policy if exists "owners unshare" on message_shares;
create policy "owners unshare" on message_shares
  for delete
  using (shared_by = auth.uid());

-- 5. Messages RLS: a user can read a message if they own it OR it's been shared into
--    a chat they're a member of. Replace whatever SELECT policy you had.
drop policy if exists "own or shared messages" on messages;
create policy "own or shared messages" on messages
  for select
  using (
    user_id = auth.uid()
    or id in (
      select message_id
      from message_shares
      where chat_id in (select chat_id from chat_members where user_id = auth.uid())
    )
  );

-- Authors can insert their own messages.
drop policy if exists "insert own messages" on messages;
create policy "insert own messages" on messages
  for insert
  with check (user_id = auth.uid());

-- Authors can update / delete their own messages.
drop policy if exists "update own messages" on messages;
create policy "update own messages" on messages
  for update using (user_id = auth.uid());

drop policy if exists "delete own messages" on messages;
create policy "delete own messages" on messages
  for delete using (user_id = auth.uid());

-- 6. Realtime: make sure these tables emit changes for supabase.channel() subscribers.
alter publication supabase_realtime add table message_shares;
-- (messages, reactions, replies should already be in the publication; add if not.)
