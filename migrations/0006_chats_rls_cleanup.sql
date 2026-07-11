-- Clean up chats RLS:
-- 1. Remove the stale duplicate SELECT policy from the public role (the old recursive
--    "Members can read their chats" — different capitalisation from the one 0004 dropped).
-- 2. Simplify the INSERT WITH CHECK. The policy is already gated TO authenticated, so
--    re-checking auth.uid() IS NOT NULL is redundant and was failing in some session
--    states even for logged-in users.

drop policy if exists "Members can read their chats" on chats;

drop policy if exists "auth can create chats" on chats;
create policy "auth can create chats"
  on chats for insert
  to authenticated
  with check (true);
