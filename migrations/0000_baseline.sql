-- ============================================================================
-- BASELINE SNAPSHOT — DOCUMENTATION ONLY, DO NOT APPLY
-- ============================================================================
-- Snapshot of the production schema as of 2026-07-10, reflecting the state
-- after migrations 0001–0016. The base tables were originally created in the
-- Supabase dashboard, so migrations 0001+ are incremental patches on a schema
-- that was never in version control. This file closes that gap: it is the
-- authoritative record of what those migrations assume.
--
-- To rebuild a fresh database: apply this file once, then apply 0017+.
-- Never apply it to the existing production project.
-- ============================================================================

-- ---------- helper functions (generated columns depend on these) ----------

create or replace function public.normalize_book(book text)
  returns text
  language sql
  immutable
as $$
  select case lower(trim(book))
    when 'psalm' then 'psalms'
    when 'song of songs' then 'song of solomon'
    else lower(trim(book))
  end
$$;

create or replace function public.ref_book_key(ref text)
  returns text
  language sql
  immutable
as $$
  select public.normalize_book(regexp_replace(trim(ref), '\s+\d+(:\d+)?$', ''))
$$;

create or replace function public.ref_chapter(ref text)
  returns integer
  language sql
  immutable
as $$
  select coalesce((regexp_match(trim(ref), '\s(\d+)(?::\d+)?$'))[1]::int, 1)
$$;

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text, -- vestigial: never written or read by the app
  created_at timestamptz default now(),
  reading_plan_id text references public.reading_plans(id) on delete set null,
  bible_translation text not null default 'ESV'
    check (bible_translation in ('ESV', 'NASB2020', 'NIV', 'NKJV', 'NLT'))
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text not null check (type in ('private', 'group')),
  created_at timestamptz default now()
);

create table public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(), -- 0016
  primary key (chat_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete cascade, -- vestigial since 0001 (shares replaced it)
  user_id uuid references public.profiles(id) on delete cascade,
  body_text text,   -- vestigial: replaced by note/transcript
  passage_ref text, -- vestigial: replaced by reference
  passage_raw text, -- vestigial
  audio_url text,   -- vestigial: replaced by voice_path (0003)
  transcript text,
  created_at timestamptz default now(),
  voice_path text,  -- 0003: storage object path in the audio-memos bucket
  note text,        -- 0012
  reference text,   -- 0012: display reference, e.g. "John 3:16-18"
  book text,        -- 0012: structured passage columns drive the plan trigger
  chapter integer,
  verse_start integer,
  verse_end integer,
  created_tz text   -- 0012: IANA timezone the log was written in
);

create table public.message_shares (
  message_id uuid not null references public.messages(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, chat_id)
);

create index message_shares_chat_idx
  on public.message_shares (chat_id, created_at desc);

create table public.reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  primary key (message_id, user_id)
);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  body_text text not null,
  created_at timestamptz default now()
);

create table public.reading_plans (
  id text primary key,
  display_name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.reading_plan_entries (
  plan_id text not null references public.reading_plans(id) on delete cascade,
  date date not null,
  begin_chapter text not null, -- e.g. "Genesis 1" or "Psalm 23:1"
  end_chapter text not null,
  description text,
  book_key text generated always as (ref_book_key(begin_chapter)) stored,
  chapter_start integer generated always as (ref_chapter(begin_chapter)) stored,
  chapter_end integer generated always as (ref_chapter(end_chapter)) stored,
  primary key (plan_id, date)
);

create table public.reading_plan_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null,
  date date not null,
  message_id uuid references public.messages(id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (user_id, plan_id, date),
  foreign key (plan_id, date)
    references public.reading_plan_entries(plan_id, date) on delete cascade
);

-- ---------- functions ----------

-- Trigger on auth.users: derive a unique username from the email local-part
-- and auto-create the profiles row.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  base      text;
  candidate text;
  suffix    int := 0;
begin
  base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_.-]', '', 'g'));
  if base is null or length(base) < 2 then
    base := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix    := suffix + 1;
    candidate := base || suffix::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- SECURITY DEFINER membership check that breaks the chats/chat_members RLS
-- recursion (0005).
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

-- SECURITY DEFINER checks that break the messages/message_shares RLS
-- recursion (0014).
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

-- Idempotent share-link self-join + chat read in one round trip (0015).
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

-- Unread tracking RPCs (0016).
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

-- Trigger on messages: a log with structured passage columns completes the
-- earliest matching un-done day of the author's selected reading plan.
create or replace function public.record_reading_plan_progress()
  returns trigger
  language plpgsql
as $$
begin
  if new.book is null or new.user_id is null then
    return new;
  end if;

  insert into public.reading_plan_progress (user_id, plan_id, date, message_id)
  select new.user_id, e.plan_id, e.date, new.id
  from public.profiles p
  join public.reading_plan_entries e on e.plan_id = p.reading_plan_id
  where p.id = new.user_id
    and e.book_key = public.normalize_book(new.book)
    and (new.chapter is null or new.chapter between e.chapter_start and e.chapter_end)
    and not exists (
      select 1 from public.reading_plan_progress rp
      where rp.user_id = new.user_id and rp.plan_id = e.plan_id and rp.date = e.date
    )
  order by e.date
  limit 1
  on conflict do nothing;

  return new;
end
$$;

-- ---------- triggers ----------

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger messages_record_reading_plan_progress
  after insert on public.messages
  for each row execute function public.record_reading_plan_progress();

-- ---------- row level security ----------
-- Policies on app tables are TO public gated on auth.uid() rather than
-- TO authenticated — see 0009 for the role-OID mismatch that motivated this.

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_shares enable row level security;
alter table public.reactions enable row level security;
alter table public.replies enable row level security;
alter table public.reading_plans enable row level security;
alter table public.reading_plan_entries enable row level security;
alter table public.reading_plan_progress enable row level security;

create policy "Users can read all profiles" on public.profiles
  for select using (true);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "chats: members can read" on public.chats
  for select using (is_chat_member(id, auth.uid()));
create policy "chats: signed-in can insert" on public.chats
  for insert with check (auth.uid() is not null);

create policy "chat_members: members read" on public.chat_members
  for select using (is_chat_member(chat_id, auth.uid()));
create policy "chat_members: self add" on public.chat_members
  for insert with check (user_id = auth.uid());
create policy "chat_members: self leave" on public.chat_members
  for delete using (user_id = auth.uid());
-- No UPDATE policy: last_read_at changes only via the mark_chat_read RPC.

create policy "messages: own or shared" on public.messages
  for select using (user_id = auth.uid() or message_shared_to_user(id, auth.uid()));
create policy "messages: insert own" on public.messages
  for insert with check (user_id = auth.uid());
create policy "messages: update own" on public.messages
  for update using (user_id = auth.uid());
create policy "messages: delete own" on public.messages
  for delete using (user_id = auth.uid());

create policy "message_shares: members read" on public.message_shares
  for select using (is_chat_member(chat_id, auth.uid()));
create policy "message_shares: owners share" on public.message_shares
  for insert with check (
    shared_by = auth.uid()
    and user_owns_message(message_id, auth.uid())
    and is_chat_member(chat_id, auth.uid())
  );
create policy "message_shares: owners unshare" on public.message_shares
  for delete using (shared_by = auth.uid());

create policy "Anyone can read reactions" on public.reactions
  for select using (true);
create policy "Users can add reactions" on public.reactions
  for insert with check (auth.uid() = user_id);
create policy "Users can remove own reactions" on public.reactions
  for delete using (auth.uid() = user_id);

create policy "Anyone can read replies" on public.replies
  for select using (true);
create policy "Users can insert replies" on public.replies
  for insert with check (auth.uid() = user_id);

create policy "reading_plans: read" on public.reading_plans
  for select to authenticated using (true);
create policy "reading_plan_entries: read" on public.reading_plan_entries
  for select to authenticated using (true);

create policy "reading_plan_progress: select own" on public.reading_plan_progress
  for select to authenticated using (user_id = auth.uid());
create policy "reading_plan_progress: insert own" on public.reading_plan_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "reading_plan_progress: update own" on public.reading_plan_progress
  for update to authenticated using (user_id = auth.uid());
create policy "reading_plan_progress: delete own" on public.reading_plan_progress
  for delete to authenticated using (user_id = auth.uid());

-- ---------- storage ----------
-- Private bucket "audio-memos" (created via dashboard; made private in 0003).
-- Objects live at {userId}/{uuid}.{webm|m4a}.

create policy "audio-memos: users write own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'audio-memos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio-memos: owners delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'audio-memos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio-memos: owner or chat-mate read" on storage.objects
  for select to authenticated using (
    bucket_id = 'audio-memos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from messages m
        join message_shares ms on ms.message_id = m.id
        join chat_members cm on cm.chat_id = ms.chat_id
        where m.voice_path = objects.name
          and cm.user_id = auth.uid()
      )
    )
  );
