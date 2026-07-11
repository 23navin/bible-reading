-- Temporary diagnostic: returns the auth context PostgREST sees for the calling request.
-- Drop after debugging.

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

grant execute on function public.debug_auth() to anon, authenticated;
