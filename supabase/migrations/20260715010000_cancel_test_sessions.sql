create or replace function public.cancel_test_service(p_user_id uuid, p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test public."Test"%rowtype;
begin
  update public."Test"
  set
    "Status" = 'cancelled',
    "CancelledAt" = now(),
    "UpdatedAt" = now()
  where "TestID" = p_test_id
    and "UserID" = p_user_id
    and "Status" in ('in_progress', 'paused')
  returning * into v_test;

  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

  return jsonb_build_object(
    'test_id', v_test."TestID",
    'status', v_test."Status",
    'cancelled_at', v_test."CancelledAt"
  );
end;
$$;

revoke all on function public.cancel_test_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_test_service(uuid, uuid) to service_role;
