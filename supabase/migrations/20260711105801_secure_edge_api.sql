-- Sensitive RPCs are callable only by the trusted Edge Function. The public
-- browser client authenticates with an anonymous user JWT and never receives
-- service-role credentials.

revoke all on function public.submit_attempt(uuid, jsonb, integer, uuid) from authenticated;
grant execute on function public.submit_attempt(uuid, jsonb, integer, uuid) to service_role;

revoke all on function public.get_leaderboard(integer) from authenticated;
grant execute on function public.get_leaderboard(integer) to service_role;

create or replace function public.submit_attempt_service(
  p_user_id uuid,
  p_set_id uuid,
  p_answers jsonb,
  p_elapsed_seconds integer,
  p_client_nonce uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'INVALID_USER' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  return public.submit_attempt(p_set_id, p_answers, p_elapsed_seconds, p_client_nonce);
end;
$$;

revoke all on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) to service_role;

create policy question_keys_deny_direct on private.question_keys
  for all to public using (false) with check (false);

create policy leaderboard_deny_direct on private.leaderboard_entries
  for all to public using (false) with check (false);
