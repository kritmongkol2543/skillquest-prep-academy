-- Postgres does not provide jsonb_object_length(jsonb). Count object keys
-- with jsonb_object_keys() so secure attempt submission can validate answer
-- payload size without failing at runtime.

create or replace function public.submit_attempt(
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
declare
  v_user_id uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_total integer;
  v_answered integer;
  v_correct integer;
  v_accuracy numeric(5,2);
  v_ranked boolean;
  v_points integer;
  v_answer_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_nonce is null or p_elapsed_seconds not between 30 and 14400 then
    raise exception 'INVALID_ATTEMPT';
  end if;

  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'INVALID_ANSWERS';
  end if;

  select count(*) into v_answer_count from jsonb_object_keys(p_answers);
  if v_answer_count > 200 then
    raise exception 'INVALID_ANSWERS';
  end if;

  select * into v_attempt
  from public.attempts
  where user_id = v_user_id and client_nonce = p_client_nonce;

  if found then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'correct_count', v_attempt.correct_count,
      'total_questions', v_attempt.total_questions,
      'accuracy', v_attempt.accuracy,
      'ranking_points', v_attempt.ranking_points,
      'ranked', v_attempt.ranked,
      'duplicate', true
    );
  end if;

  if not exists (select 1 from public.question_sets where id = p_set_id and is_active = true) then
    raise exception 'SET_NOT_AVAILABLE';
  end if;

  if exists (select 1 from jsonb_each_text(p_answers) a where a.value !~ '^[0-5]$') then
    raise exception 'INVALID_ANSWERS';
  end if;

  if (select count(*) from public.attempts where user_id = v_user_id and submitted_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || p_set_id::text || current_date::text, 0));

  select count(*) into v_total from public.questions where set_id = p_set_id;
  if v_total = 0 then raise exception 'EMPTY_SET'; end if;

  select count(*) into v_answered
  from public.questions q
  where q.set_id = p_set_id and p_answers ? q.id::text;

  select count(*) into v_correct
  from public.questions q
  join private.question_keys k on k.question_id = q.id
  where q.set_id = p_set_id
    and p_answers ? q.id::text
    and (p_answers ->> q.id::text)::smallint = k.correct_choice;

  v_accuracy := round((v_correct::numeric * 100) / v_total, 2);
  v_ranked := not exists (
    select 1 from public.attempts
    where user_id = v_user_id and set_id = p_set_id and ranked
      and submitted_at >= current_date::timestamptz
      and submitted_at < (current_date + 1)::timestamptz
  );
  v_points := case when v_ranked then greatest(0, v_correct * 100 + greatest(0, 300 - (p_elapsed_seconds / 10))) else 0 end;

  insert into public.attempts (
    user_id, set_id, client_nonce, elapsed_seconds, answered_count,
    correct_count, total_questions, accuracy, ranking_points, ranked
  ) values (
    v_user_id, p_set_id, p_client_nonce, p_elapsed_seconds, v_answered,
    v_correct, v_total, v_accuracy, v_points, v_ranked
  ) returning * into v_attempt;

  insert into private.leaderboard_entries (
    user_id, display_name, ranking_points, attempts_count, accuracy_avg, active_seconds, updated_at
  )
  select
    v_user_id,
    coalesce((select display_name from public.profiles where user_id = v_user_id), 'ผู้เตรียมสอบ'),
    coalesce(sum(a.ranking_points), 0),
    count(*)::integer,
    round(avg(a.accuracy), 2),
    coalesce(sum(a.elapsed_seconds), 0),
    now()
  from public.attempts a
  where a.user_id = v_user_id
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    ranking_points = excluded.ranking_points,
    attempts_count = excluded.attempts_count,
    accuracy_avg = excluded.accuracy_avg,
    active_seconds = excluded.active_seconds,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'correct_count', v_attempt.correct_count,
    'total_questions', v_attempt.total_questions,
    'accuracy', v_attempt.accuracy,
    'ranking_points', v_attempt.ranking_points,
    'ranked', v_attempt.ranked,
    'duplicate', false
  );
end;
$$;

revoke all on function public.submit_attempt(uuid, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.submit_attempt(uuid, jsonb, integer, uuid) to service_role;
