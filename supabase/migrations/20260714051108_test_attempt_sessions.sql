create extension if not exists pgcrypto with schema extensions;

drop index if exists public."Test_CategoryID_key";

alter table public."Test"
  add column if not exists "UserID" uuid references auth.users (id) on delete cascade,
  add column if not exists "ClientNonce" uuid,
  add column if not exists "Status" text not null default 'catalog_legacy',
  add column if not exists "StartedAt" timestamptz not null default now(),
  add column if not exists "UpdatedAt" timestamptz not null default now(),
  add column if not exists "PausedAt" timestamptz,
  add column if not exists "CancelledAt" timestamptz,
  add column if not exists "SubmittedAt" timestamptz;

alter table public."Test" drop constraint if exists "Test_Status_check";
alter table public."Test"
  add constraint "Test_Status_check"
  check ("Status" in ('catalog_legacy', 'in_progress', 'paused', 'cancelled', 'submitted'));

update public."Test"
set "Status" = 'catalog_legacy'
where "UserID" is null;

create index if not exists "Test_UserID_Status_UpdatedAt_idx"
  on public."Test" ("UserID", "Status", "UpdatedAt" desc)
  where "UserID" is not null;

create index if not exists "Test_UserID_ClientNonce_idx"
  on public."Test" ("UserID", "ClientNonce")
  where "UserID" is not null and "ClientNonce" is not null;

create index if not exists "Test_CategoryID_idx"
  on public."Test" ("CategoryID")
  where "CategoryID" is not null;

create or replace function public.list_tests_service()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with category_sets as (
    select
      c."CategoryID",
      c."Category",
      s."SubjectID",
      s."Subject",
      count(q."QuestionID")::integer as question_count,
      coalesce(nullif(min(nullif(q."Level", 'EMPTY')), ''), 'ชุดฝึกสอบ') as level
    from public."Category" c
    join public."Subject" s on s."SubjectID" = c."SubjectID"
    join public."Question" q on q."CategoryID" = c."CategoryID"
    group by c."CategoryID", c."Category", s."SubjectID", s."Subject"
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'test_id', cs."CategoryID",
    'category_id', cs."CategoryID",
    'title', cs."Subject" || ' · ชุดที่ ' || cs."Category",
    'subject', cs."Subject",
    'subject_id', cs."SubjectID",
    'category', cs."Category",
    'level', cs.level,
    'duration', greatest(600, cs.question_count * 60),
    'question_count', cs.question_count
  ) order by cs."Subject", case when cs."Category" ~ '^[0-9]+(\.[0-9]+)?$' then cs."Category"::numeric end nulls last, cs."Category"), '[]'::jsonb)
  from category_sets cs
  where cs.question_count > 0;
$$;

create or replace function public.start_test_service(
  p_user_id uuid,
  p_category_id uuid,
  p_client_nonce uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category record;
  v_first_question record;
  v_question_count integer;
  v_test public."Test"%rowtype;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if p_category_id is null then raise exception 'INVALID_CATEGORY'; end if;
  if p_client_nonce is null then raise exception 'INVALID_CLIENT_NONCE'; end if;

  perform public.upsert_profile_service(p_user_id, null);

  select c."CategoryID", c."Category", s."SubjectID", s."Subject"
    into v_category
  from public."Category" c
  join public."Subject" s on s."SubjectID" = c."SubjectID"
  where c."CategoryID" = p_category_id;
  if not found then raise exception 'CATEGORY_NOT_AVAILABLE'; end if;

  select q."QuestionID", coalesce(nullif(nullif(q."Level", 'EMPTY'), ''), 'ชุดฝึกสอบ') as level
    into v_first_question
  from public."Question" q
  where q."CategoryID" = p_category_id
  order by q."QuestionID"
  limit 1;
  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

  select count(*)::integer into v_question_count
  from public."Question" q
  where q."CategoryID" = p_category_id;

  update public."Test"
  set
    "Status" = 'cancelled',
    "CancelledAt" = now(),
    "UpdatedAt" = now()
  where "UserID" = p_user_id
    and "Status" in ('in_progress', 'paused');

  insert into public."Test" (
    "QuestionID", "Subject", "Category", "Level", "Duration", "CategoryID", "QuestionCount",
    "UserID", "ClientNonce", "Status", "StartedAt", "UpdatedAt"
  )
  values (
    v_first_question."QuestionID",
    v_category."Subject",
    'ชุดที่ ' || v_category."Category",
    v_first_question.level,
    greatest(600, v_question_count * 60),
    p_category_id,
    v_question_count,
    p_user_id,
    p_client_nonce,
    'in_progress',
    now(),
    now()
  )
  returning * into v_test;

  return jsonb_build_object(
    'test_id', v_test."TestID",
    'category_id', v_test."CategoryID",
    'title', v_category."Subject" || ' · ชุดที่ ' || v_category."Category",
    'subject', v_category."Subject",
    'subject_id', v_category."SubjectID",
    'category', v_category."Category",
    'level', v_test."Level",
    'duration', v_test."Duration",
    'question_count', v_test."QuestionCount",
    'status', v_test."Status"
  );
end;
$$;

drop function if exists public.get_test_questions_service(uuid);

create or replace function public.get_test_questions_service(p_user_id uuid, p_test_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_test as (
    select
      t."TestID",
      t."Level",
      t."Duration",
      t."QuestionCount",
      c."CategoryID",
      c."Category",
      s."SubjectID",
      s."Subject"
    from public."Test" t
    join public."Category" c on c."CategoryID" = t."CategoryID"
    join public."Subject" s on s."SubjectID" = c."SubjectID"
    where t."TestID" = p_test_id
      and t."UserID" = p_user_id
      and t."Status" in ('in_progress', 'paused', 'submitted')
  ),
  q_rows as (
    select
      q."QuestionID",
      q."Question",
      q."SubjectID",
      q."CategoryID",
      q."Level",
      q."ImageLink",
      row_number() over (partition by q."CategoryID" order by q."QuestionID") as position
    from public."Question" q
    join selected_test st on st."CategoryID" = q."CategoryID"
  )
  select jsonb_build_object(
    'test', jsonb_build_object(
      'test_id', st."TestID",
      'category_id', st."CategoryID",
      'title', st."Subject" || ' · ชุดที่ ' || st."Category",
      'subject', st."Subject",
      'subject_id', st."SubjectID",
      'category', st."Category",
      'level', st."Level",
      'duration', st."Duration",
      'question_count', st."QuestionCount"
    ),
    'questions', coalesce(jsonb_agg(jsonb_build_object(
      'id', q."QuestionID",
      'question', q."Question",
      'subject_id', q."SubjectID",
      'category_id', q."CategoryID",
      'level', coalesce(nullif(nullif(q."Level", 'EMPTY'), ''), st."Level"),
      'image', q."ImageLink",
      'position', q.position,
      'choices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'answer_id', a."AnswerID",
          'choice_index', a."ChoiceIndex",
          'answer', a."Answer",
          'image', a."Image"
        ) order by a."ChoiceIndex")
        from public."Answer" a
        where a."QuestionID" = q."QuestionID"
      ), '[]'::jsonb)
    ) order by q.position), '[]'::jsonb)
  )
  from selected_test st
  left join q_rows q on q."CategoryID" = st."CategoryID"
  group by st."TestID", st."Level", st."Duration", st."QuestionCount", st."CategoryID", st."Category", st."SubjectID", st."Subject";
$$;

create or replace function public.pause_test_service(p_user_id uuid, p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test public."Test"%rowtype;
begin
  update public."Test"
  set "Status" = 'paused', "PausedAt" = now(), "UpdatedAt" = now()
  where "TestID" = p_test_id
    and "UserID" = p_user_id
    and "Status" in ('in_progress', 'paused')
  returning * into v_test;

  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

  return jsonb_build_object(
    'test_id', v_test."TestID",
    'status', v_test."Status",
    'paused_at', v_test."PausedAt"
  );
end;
$$;

create or replace function public.log_question_activity_service(
  p_user_id uuid,
  p_set_id uuid,
  p_client_nonce uuid,
  p_question_id uuid,
  p_event_type text,
  p_duration_seconds integer,
  p_selected_choice integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test public."Test"%rowtype;
  v_question record;
  v_answer_id uuid;
  v_answer_text text;
  v_answer_image text;
  v_answer_explanation text;
  v_log_id uuid;
  v_duration integer;
begin
  if p_duration_seconds is null or p_duration_seconds < 0 then raise exception 'INVALID_DURATION'; end if;
  if p_event_type not in ('enter', 'heartbeat', 'answer', 'pause', 'skip', 'submit', 'hint') then raise exception 'INVALID_EVENT_TYPE'; end if;
  if p_status not in ('viewed', 'answered', 'changed_answer', 'skipped', 'paused', 'submitted', 'correct', 'incorrect') then raise exception 'INVALID_STATUS'; end if;
  if p_selected_choice is not null and (p_selected_choice < 0 or p_selected_choice > 4) then raise exception 'INVALID_CHOICE'; end if;

  select * into v_test
  from public."Test"
  where "TestID" = p_set_id
    and "UserID" = p_user_id
    and "ClientNonce" = p_client_nonce
    and "Status" in ('in_progress', 'paused');
  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

  select q."QuestionID", q."Question", q."SubjectID", q."CategoryID", q."Level", q."ImageLink"
    into v_question
  from public."Question" q
  where q."QuestionID" = p_question_id
    and q."CategoryID" = v_test."CategoryID";
  if not found then raise exception 'QUESTION_NOT_AVAILABLE'; end if;

  if p_selected_choice is not null then
    select a."AnswerID", a."Answer", a."Image", a."Explanation"
      into v_answer_id, v_answer_text, v_answer_image, v_answer_explanation
    from public."Answer" a
    where a."QuestionID" = p_question_id and a."ChoiceIndex" = p_selected_choice;
    if not found then raise exception 'ANSWER_NOT_AVAILABLE'; end if;
  end if;

  insert into public."Log" (
    "UserID", "ClientNonce", "TestID", "QuestionID", "Question",
    "SubjectID", "CategoryID", "Level", "AnswerID", "Answer",
    "Status", "Image", "Explanation", "Duration", "EventType", "SelectedChoice"
  )
  values (
    p_user_id, p_client_nonce, p_set_id, p_question_id, v_question."Question",
    v_question."SubjectID", v_question."CategoryID", coalesce(nullif(nullif(v_question."Level", 'EMPTY'), ''), v_test."Level"),
    v_answer_id, v_answer_text, p_status,
    coalesce(v_answer_image, v_question."ImageLink"), v_answer_explanation,
    p_duration_seconds, p_event_type, p_selected_choice
  )
  on conflict ("UserID", "ClientNonce", "QuestionID")
  do update set
    "AnswerID" = coalesce(excluded."AnswerID", public."Log"."AnswerID"),
    "Answer" = coalesce(excluded."Answer", public."Log"."Answer"),
    "Status" = excluded."Status",
    "Image" = coalesce(excluded."Image", public."Log"."Image"),
    "Explanation" = coalesce(excluded."Explanation", public."Log"."Explanation"),
    "TimeStamp" = now(),
    "Duration" = greatest(public."Log"."Duration", excluded."Duration"),
    "EventType" = excluded."EventType",
    "SelectedChoice" = excluded."SelectedChoice"
  returning "LogID", "Duration" into v_log_id, v_duration;

  update public."Test"
  set
    "Status" = case when p_event_type = 'pause' or p_status = 'paused' then 'paused' else 'in_progress' end,
    "PausedAt" = case when p_event_type = 'pause' or p_status = 'paused' then now() else "PausedAt" end,
    "UpdatedAt" = now()
  where "TestID" = p_set_id
    and "Status" in ('in_progress', 'paused');

  return jsonb_build_object('log_id', v_log_id, 'duration_seconds', v_duration, 'view_count', 1, 'status', p_status);
end;
$$;

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
  v_log_id uuid;
  v_existing record;
  v_existing_found boolean := false;
  v_hints_used integer;
  v_eliminated_choices jsonb;
  v_eliminated_answer_ids jsonb;
  v_hint_id uuid;
begin
  perform public.log_question_activity_service(p_user_id, p_set_id, p_client_nonce, p_question_id, 'hint', p_duration_seconds, null, 'viewed');

  select l."LogID" into v_log_id
  from public."Log" l
  where l."UserID" = p_user_id and l."ClientNonce" = p_client_nonce and l."TestID" = p_set_id and l."QuestionID" = p_question_id;

  select h."HintID", h."EliminatedChoices", h."Point" into v_existing
  from public."Hint" h
  where h."UserID" = p_user_id and h."ClientNonce" = p_client_nonce and h."LogID" = v_log_id;
  v_existing_found := found;

  select count(*) into v_hints_used
  from public."Hint" h
  where h."UserID" = p_user_id and h."TestID" = p_set_id and h."ClientNonce" = p_client_nonce;

  if v_existing_found then
    return jsonb_build_object(
      'hint_id', v_existing."HintID",
      'hint_text', 'ระบบตัดตัวเลือกที่ผิดออกให้ 2 ข้อแล้ว',
      'hint_type', 'eliminate_wrong_choices',
      'eliminated_choices', v_existing."EliminatedChoices",
      'point_penalty', v_existing."Point",
      'hints_used', v_hints_used,
      'hints_remaining', greatest(0, 2 - v_hints_used),
      'total_penalty', v_hints_used * 0.5
    );
  end if;

  if v_hints_used >= 2 then raise exception 'HINT_LIMIT_REACHED'; end if;

  select coalesce(jsonb_agg(x."ChoiceIndex" order by x."ChoiceIndex"), '[]'::jsonb),
         coalesce(jsonb_agg(x."AnswerID" order by x."ChoiceIndex"), '[]'::jsonb)
    into v_eliminated_choices, v_eliminated_answer_ids
  from (
    select a."ChoiceIndex", a."AnswerID"
    from public."Answer" a
    where a."QuestionID" = p_question_id and a."Status" = false
    order by a."ChoiceIndex"
    limit 2
  ) x;

  if jsonb_array_length(v_eliminated_choices) < 2 then raise exception 'HINT_NOT_AVAILABLE'; end if;

  insert into public."Hint" ("HintType", "Point", "TestID", "LogID", "UserID", "ClientNonce", "QuestionID", "EliminatedAnswerIDs", "EliminatedChoices")
  values ('eliminate_wrong_choices', 0.50, p_set_id, v_log_id, p_user_id, p_client_nonce, p_question_id, v_eliminated_answer_ids, v_eliminated_choices)
  returning "HintID" into v_hint_id;

  v_hints_used := v_hints_used + 1;
  return jsonb_build_object(
    'hint_id', v_hint_id,
    'hint_text', 'ระบบตัดตัวเลือกที่ผิดออกให้ 2 ข้อแล้ว',
    'hint_type', 'eliminate_wrong_choices',
    'eliminated_choices', v_eliminated_choices,
    'point_penalty', 0.5,
    'hints_used', v_hints_used,
    'hints_remaining', greatest(0, 2 - v_hints_used),
    'total_penalty', v_hints_used * 0.5
  );
end;
$$;

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
declare
  v_test public."Test"%rowtype;
  v_existing_attempt public."Attempt"%rowtype;
  v_total integer;
  v_answered integer := 0;
  v_correct integer := 0;
  v_hint_count integer := 0;
  v_penalty numeric := 0;
  v_score numeric := 0;
  v_accuracy numeric := 0;
  v_ranking_points bigint := 0;
  v_item record;
  v_answer record;
  v_attempt_id uuid;
begin
  if p_elapsed_seconds is null or p_elapsed_seconds < 0 then raise exception 'INVALID_DURATION'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'INVALID_ANSWERS'; end if;

  select * into v_test
  from public."Test"
  where "TestID" = p_set_id
    and "UserID" = p_user_id
    and "ClientNonce" = p_client_nonce;
  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

  select * into v_existing_attempt
  from public."Attempt"
  where "UserID" = p_user_id and "ClientNonce" = p_client_nonce and "TestID" = p_set_id;

  if found and v_test."Status" = 'submitted' then
    return jsonb_build_object(
      'attempt_id', v_existing_attempt."AttemptID",
      'correct_count', v_existing_attempt."CorrectCount",
      'answered_count', v_existing_attempt."AnsweredCount",
      'total_questions', v_existing_attempt."TotalQuestions",
      'accuracy', v_existing_attempt."Accuracy",
      'score', v_existing_attempt."Score",
      'hint_count', v_existing_attempt."HintCount",
      'hint_penalty', v_existing_attempt."HintPenalty",
      'ranking_points', v_existing_attempt."RankingPoints",
      'ranked', v_existing_attempt."Ranked",
      'duplicate', true
    );
  end if;

  if v_test."Status" not in ('in_progress', 'paused') then raise exception 'SET_NOT_AVAILABLE'; end if;

  perform public.upsert_profile_service(p_user_id, null);

  select count(*) into v_total from public."Question" q where q."CategoryID" = v_test."CategoryID";
  if v_total = 0 then raise exception 'SET_NOT_AVAILABLE'; end if;

  for v_item in select key::uuid as question_id, value::integer as choice_index from jsonb_each_text(p_answers)
  loop
    if v_item.choice_index < 0 or v_item.choice_index > 4 then raise exception 'INVALID_CHOICE'; end if;

    select a."AnswerID", a."Answer", a."Status", a."Image", a."Explanation" into v_answer
    from public."Question" q
    join public."Answer" a on a."QuestionID" = q."QuestionID"
    where q."QuestionID" = v_item.question_id
      and q."CategoryID" = v_test."CategoryID"
      and a."ChoiceIndex" = v_item.choice_index;

    if found then
      v_answered := v_answered + 1;
      if v_answer."Status" = true then v_correct := v_correct + 1; end if;
      perform public.log_question_activity_service(
        p_user_id, p_set_id, p_client_nonce, v_item.question_id, 'submit', 0, v_item.choice_index,
        case when v_answer."Status" then 'correct' else 'incorrect' end
      );
    end if;
  end loop;

  select count(*) into v_hint_count
  from public."Hint" h
  where h."UserID" = p_user_id and h."TestID" = p_set_id and h."ClientNonce" = p_client_nonce;

  v_penalty := v_hint_count * 0.5;
  v_score := greatest(v_correct - v_penalty, 0);
  v_accuracy := round((v_correct::numeric / v_total::numeric) * 100, 2);
  v_ranking_points := greatest(0, round((v_score * 100) + greatest(0, (v_total * 60) - p_elapsed_seconds) / 10.0));

  insert into public."Attempt" (
    "UserID", "ClientNonce", "TestID", "CorrectCount", "AnsweredCount", "TotalQuestions",
    "Accuracy", "Score", "HintCount", "HintPenalty", "ElapsedSeconds", "RankingPoints", "Ranked"
  )
  values (
    p_user_id, p_client_nonce, p_set_id, v_correct, v_answered, v_total,
    v_accuracy, v_score, v_hint_count, v_penalty, p_elapsed_seconds, v_ranking_points, true
  )
  on conflict ("UserID", "ClientNonce", "TestID")
  do update set
    "CorrectCount" = excluded."CorrectCount",
    "AnsweredCount" = excluded."AnsweredCount",
    "TotalQuestions" = excluded."TotalQuestions",
    "Accuracy" = excluded."Accuracy",
    "Score" = excluded."Score",
    "HintCount" = excluded."HintCount",
    "HintPenalty" = excluded."HintPenalty",
    "ElapsedSeconds" = excluded."ElapsedSeconds",
    "RankingPoints" = excluded."RankingPoints",
    "SubmittedAt" = now()
  returning "AttemptID" into v_attempt_id;

  update public."Test"
  set "Status" = 'submitted', "SubmittedAt" = now(), "UpdatedAt" = now()
  where "TestID" = p_set_id;

  update public."Profile" p
  set
    "RankingPoints" = s.points,
    "AttemptsCount" = s.attempts_count,
    "AccuracyAvg" = s.accuracy_avg,
    "ActiveSeconds" = s.active_seconds,
    "UpdatedAt" = now()
  from (
    select
      coalesce(sum(a."RankingPoints"), 0)::bigint as points,
      count(*)::integer as attempts_count,
      coalesce(round(avg(a."Accuracy"), 2), 0)::numeric as accuracy_avg,
      coalesce(sum(a."ElapsedSeconds"), 0)::bigint as active_seconds
    from public."Attempt" a
    where a."UserID" = p_user_id
  ) s
  where p."UserID" = p_user_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'correct_count', v_correct,
    'answered_count', v_answered,
    'total_questions', v_total,
    'accuracy', v_accuracy,
    'score', v_score,
    'hint_count', v_hint_count,
    'hint_penalty', v_penalty,
    'ranking_points', v_ranking_points,
    'ranked', true,
    'duplicate', false
  );
end;
$$;

revoke all on function public.list_tests_service() from public, anon, authenticated;
revoke all on function public.start_test_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_test_questions_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pause_test_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) from public, anon, authenticated;

grant execute on function public.list_tests_service() to service_role;
grant execute on function public.start_test_service(uuid, uuid, uuid) to service_role;
grant execute on function public.get_test_questions_service(uuid, uuid) to service_role;
grant execute on function public.pause_test_service(uuid, uuid) to service_role;
grant execute on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, integer, text) to service_role;
grant execute on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) to service_role;
