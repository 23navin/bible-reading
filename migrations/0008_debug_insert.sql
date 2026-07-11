-- Diagnostic: attempt the same INSERT into chats inside a SECURITY INVOKER RPC,
-- so it runs under the caller's role and RLS context. If this succeeds while a
-- direct PostgREST .from('chats').insert(...) fails, the issue is not the policy
-- itself but something about how the table call is being made.

create or replace function public.debug_create_chat()
  returns jsonb
  language plpgsql
  security invoker
as $$
declare
  v_id uuid;
begin
  insert into chats (name, type)
  values ('debug-' || substr(gen_random_uuid()::text, 1, 8), 'group')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
exception when others then
  return jsonb_build_object(
    'ok',   false,
    'code', sqlstate,
    'err',  sqlerrm
  );
end;
$$;

grant execute on function public.debug_create_chat() to authenticated;
