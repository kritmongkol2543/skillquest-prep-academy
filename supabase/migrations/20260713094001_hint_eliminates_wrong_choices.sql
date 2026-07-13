-- Hint behavior: each hint eliminates wrong answer choices for the active
-- question. The browser receives only eliminated choice indexes, not the
-- correct answer key.

alter table public.hint_logs
  add column if not exists eliminated_choices jsonb not null default '[]'::jsonb;

create or replace function public.use_hint_service(
  p_user_id uuid,
  p_set_id uuid,
  p_client_nonce uuid,
  p_question_id uuid,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_question_used integer;
  v_log_id uuid;
  v_hint_log public.hint_logs%rowtype;
  v_correct_choice smallint;
  v_eliminated jsonb;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'INVALID_USER' using errcode = '42501';
  end if;

  if p_client_nonce is null then
    raise exception 'INVALID_HINT';
  end if;

  if not exists (
    select 1 from public.questions q
    join public.question_sets s on s.id = q.set_id
    where q.id = p_question_id and q.set_id = p_set_id and s.is_active = true
  ) then
    raise exception 'QUESTION_NOT_AVAILABLE';
  end if;

  select count(*) into v_used
  from public.hint_logs
  where user_id = p_user_id and test_id = p_set_id and client_nonce = p_client_nonce;

  if v_used >= 2 then
    raise exception 'HINT_LIMIT_REACHED';
  end if;

  select count(*) into v_question_used
  from public.hint_logs
  where user_id = p_user_id
    and test_id = p_set_id
    and client_nonce = p_client_nonce
    and question_id = p_question_id;

  if v_question_used > 0 then
    raise exception 'HINT_ALREADY_USED_FOR_QUESTION';
  end if;

  select correct_choice into v_correct_choice
  from private.question_keys
  where question_id = p_question_id;

  if not found then
    raise exception 'QUESTION_KEY_UNAVAILABLE';
  end if;

  select coalesce(jsonb_agg(choice_index order by choice_index), '[]'::jsonb)
  into v_eliminated
  from (
    select choice_index
    from jsonb_array_elements((select choices from public.questions where id = p_question_id)) with ordinality as choices(choice_value, choice_number)
    cross join lateral (select (choice_number - 1)::integer as choice_index) numbered
    where choice_index <> v_correct_choice
    order by choice_index
    limit 2
  ) wrong_choices;

  select (public.log_question_activity_service(
    p_user_id, p_set_id, p_client_nonce, p_question_id, 'hint',
    greatest(coalesce(p_duration_seconds, 0), 0), null, 'viewed'
  ) ->> 'log_id')::uuid into v_log_id;

  insert into public.hint_logs (
    user_id, test_id, client_nonce, log_id, question_id,
    hint_type, hint_text, point_penalty, eliminated_choices
  ) values (
    p_user_id,
    p_set_id,
    p_client_nonce,
    v_log_id,
    p_question_id,
    'eliminate_choices',
    'ระบบตัดตัวเลือกที่ผิดออกให้ 2 ข้อ',
    0.5,
    v_eliminated
  )
  returning * into v_hint_log;

  return jsonb_build_object(
    'hint_id', v_hint_log.id,
    'hint_text', v_hint_log.hint_text,
    'hint_type', v_hint_log.hint_type,
    'eliminated_choices', v_hint_log.eliminated_choices,
    'point_penalty', v_hint_log.point_penalty,
    'hints_used', v_used + 1,
    'hints_remaining', greatest(0, 2 - (v_used + 1)),
    'total_penalty', (v_used + 1) * 0.5
  );
end;
$$;

revoke all on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) to service_role;
