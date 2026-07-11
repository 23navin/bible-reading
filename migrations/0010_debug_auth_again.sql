-- Re-add the diagnostic so we can see what auth context the chats insert
-- actually has under the new TO public / auth.uid() policy.

create or replace function public.debug_auth()
  returns jsonb
  language sql
  stable
  security invoker
as $$
  select jsonb_build_object(
    'uid',          auth.uid(),
    'jwt_role',     auth.role(),
    'current_user', current_user,
    'session_user', session_user
  );
$$;

grant execute on function public.debug_auth() to anon, authenticated, public;
