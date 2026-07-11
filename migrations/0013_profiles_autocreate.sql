-- Auto-create a profiles row for every new auth.users insert, and backfill any
-- existing auth users that are missing one. messages.user_id has an FK into
-- profiles, so users without a profile can't post.

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
  -- Derive a username candidate from the email local part. For the username/
  -- password flow these are `{username}@scriptureshare.local`, so the local
  -- part already matches the chosen username. For real emails we sanitize.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for existing auth users that don't have one yet.
insert into public.profiles (id, username, display_name)
select
  u.id,
  case
    when length(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_.-]', '', 'g')) >= 2
      then regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_.-]', '', 'g')
    else 'user' || substr(replace(u.id::text, '-', ''), 1, 8)
  end as username,
  split_part(u.email, '@', 1) as display_name
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
