create extension if not exists pgcrypto with schema extensions;

alter table public."Test"
  add column if not exists "CategoryID" uuid references public."Category" ("CategoryID") on delete restrict,
  add column if not exists "QuestionCount" integer not null default 0 check ("QuestionCount" >= 0);

alter table public."Answer"
  alter column "Status" type boolean
  using case
    when pg_typeof("Status")::text = 'boolean' then "Status"::boolean
    when lower("Status"::text) in ('true', 'correct', 't', '1') then true
    else false
  end;

alter table public."Log" drop constraint if exists "Log_SelectedChoice_check";
alter table public."Log"
  add constraint "Log_SelectedChoice_check"
  check ("SelectedChoice" is null or ("SelectedChoice" >= 0 and "SelectedChoice" <= 4));

create unique index if not exists "Test_CategoryID_key"
  on public."Test" ("CategoryID")
  where "CategoryID" is not null;

insert into public."Test" ("TestID", "QuestionID", "Subject", "Category", "Level", "Duration", "CategoryID", "QuestionCount")
select
  gen_random_uuid(),
  first_q."QuestionID",
  s."Subject",
  'ชุดที่ ' || c."Category",
  coalesce(nullif(first_q."Level", ''), 'ชุดฝึกสอบ'),
  greatest(600, count(q."QuestionID")::integer * 60),
  c."CategoryID",
  count(q."QuestionID")::integer
from public."Category" c
join public."Subject" s on s."SubjectID" = c."SubjectID"
join lateral (
  select q0."QuestionID", q0."Level"
  from public."Question" q0
  where q0."CategoryID" = c."CategoryID"
  order by q0."QuestionID"
  limit 1
) first_q on true
join public."Question" q on q."CategoryID" = c."CategoryID"
where not exists (
  select 1 from public."Test" t where t."CategoryID" = c."CategoryID"
)
group by c."CategoryID", c."Category", s."Subject", first_q."QuestionID", first_q."Level";

update public."Test" t
set
  "QuestionCount" = q_counts.question_count,
  "Duration" = greatest(600, q_counts.question_count * 60)
from (
  select "CategoryID", count(*)::integer as question_count
  from public."Question"
  group by "CategoryID"
) q_counts
where t."CategoryID" = q_counts."CategoryID";

create table if not exists public."Profile" (
  "UserID" uuid primary key references auth.users (id) on delete cascade,
  "PublicID" uuid not null default gen_random_uuid(),
  "DisplayName" text not null default 'ผู้เตรียมสอบ',
  "RankingPoints" bigint not null default 0,
  "AttemptsCount" integer not null default 0,
  "AccuracyAvg" numeric(6,2) not null default 0,
  "ActiveSeconds" bigint not null default 0,
  "UpdatedAt" timestamptz not null default now(),
  unique ("PublicID")
);

create table if not exists public."Attempt" (
  "AttemptID" uuid primary key default gen_random_uuid(),
  "UserID" uuid not null references auth.users (id) on delete cascade,
  "ClientNonce" uuid not null,
  "TestID" uuid not null references public."Test" ("TestID") on delete cascade,
  "CorrectCount" integer not null default 0,
  "AnsweredCount" integer not null default 0,
  "TotalQuestions" integer not null default 0,
  "Accuracy" numeric(6,2) not null default 0,
  "Score" numeric(8,2) not null default 0,
  "HintCount" integer not null default 0,
  "HintPenalty" numeric(8,2) not null default 0,
  "ElapsedSeconds" integer not null default 0,
  "RankingPoints" bigint not null default 0,
  "Ranked" boolean not null default true,
  "SubmittedAt" timestamptz not null default now(),
  unique ("UserID", "ClientNonce", "TestID")
);

alter table public."Profile" enable row level security;
alter table public."Attempt" enable row level security;

revoke all on table public."Profile", public."Attempt" from public, anon, authenticated;
grant select, insert, update, delete on table public."Profile", public."Attempt" to service_role;

create index if not exists "Question_CategoryID_QuestionID_idx" on public."Question" ("CategoryID", "QuestionID");
create index if not exists "Answer_QuestionID_ChoiceIndex_idx" on public."Answer" ("QuestionID", "ChoiceIndex");
create index if not exists "Attempt_UserID_SubmittedAt_idx" on public."Attempt" ("UserID", "SubmittedAt" desc);
create index if not exists "Log_UserID_Timestamp_idx" on public."Log" ("UserID", "TimeStamp" desc);

create or replace function public.upsert_profile_service(p_user_id uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(trim(coalesce(p_display_name, 'ผู้เตรียมสอบ')), 24);
  v_profile public."Profile"%rowtype;
begin
  if v_name = '' then
    v_name := 'ผู้เตรียมสอบ';
  end if;

  insert into public."Profile" ("UserID", "DisplayName")
  values (p_user_id, v_name)
  on conflict ("UserID") do update set
    "DisplayName" = excluded."DisplayName",
    "UpdatedAt" = now()
  returning * into v_profile;

  return to_jsonb(v_profile);
end;
$$;

create or replace function public.list_tests_service()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'test_id', t."TestID",
    'category_id', c."CategoryID",
    'title', s."Subject" || ' · ชุดที่ ' || c."Category",
    'subject', s."Subject",
    'subject_id', s."SubjectID",
    'category', c."Category",
    'level', t."Level",
    'duration', t."Duration",
    'question_count', t."QuestionCount"
  ) order by s."Subject", case when c."Category" ~ '^[0-9]+(\.[0-9]+)?$' then c."Category"::numeric end nulls last, c."Category"), '[]'::jsonb)
  from public."Test" t
  join public."Category" c on c."CategoryID" = t."CategoryID"
  join public."Subject" s on s."SubjectID" = c."SubjectID"
  where t."QuestionCount" > 0;
$$;

create or replace function public.get_test_questions_service(p_test_id uuid)
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
      'level', q."Level",
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
    ) order by q."QuestionID"), '[]'::jsonb)
  )
  from selected_test st
  left join q_rows q on q."CategoryID" = st."CategoryID"
  group by st."TestID", st."Level", st."Duration", st."QuestionCount", st."CategoryID", st."Category", st."SubjectID", st."Subject";
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

  select * into v_test from public."Test" where "TestID" = p_set_id;
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
    v_question."SubjectID", v_question."CategoryID", v_question."Level",
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
  where l."UserID" = p_user_id and l."ClientNonce" = p_client_nonce and l."QuestionID" = p_question_id;

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

  select * into v_test from public."Test" where "TestID" = p_set_id;
  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

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

create or replace function public.get_attempt_history_service(p_user_id uuid, p_limit integer default 10)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a."AttemptID",
    'accuracy', a."Accuracy",
    'correct_count', a."CorrectCount",
    'total_questions', a."TotalQuestions",
    'elapsed_seconds', a."ElapsedSeconds",
    'ranked', a."Ranked",
    'submitted_at', a."SubmittedAt",
    'Test', jsonb_build_object('Question', s."Subject" || ' · ชุดที่ ' || c."Category", 'Subject', s."Subject")
  ) order by a."SubmittedAt" desc), '[]'::jsonb)
  from (
    select *
    from public."Attempt" a
    where a."UserID" = p_user_id
    order by a."SubmittedAt" desc
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  ) a
  join public."Test" t on t."TestID" = a."TestID"
  join public."Category" c on c."CategoryID" = t."CategoryID"
  join public."Subject" s on s."SubjectID" = c."SubjectID";
$$;

create or replace function public.get_dashboard_summary_service(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with attempts as (
    select *
    from public."Attempt"
    where "UserID" = p_user_id
  ),
  logs as (
    select *
    from public."Log"
    where "UserID" = p_user_id
  ),
  subject_rows as (
    select
      s."Subject" as subject,
      count(distinct a."AttemptID")::integer as attempts,
      coalesce(round(avg(a."Accuracy"), 2), 0)::numeric as accuracy,
      coalesce(sum(a."ElapsedSeconds"), 0)::bigint as active_seconds
    from public."Subject" s
    left join public."Category" c on c."SubjectID" = s."SubjectID"
    left join public."Test" t on t."CategoryID" = c."CategoryID"
    left join attempts a on a."TestID" = t."TestID"
    group by s."Subject"
  ),
  subject_stats as (
    select jsonb_agg(jsonb_build_object(
      'subject', subject,
      'attempts', attempts,
      'accuracy', accuracy,
      'active_seconds', active_seconds
    ) order by subject) as items
    from subject_rows
  )
  select jsonb_build_object(
    'attempts_count', coalesce((select count(*) from attempts), 0),
    'average_accuracy', coalesce((select round(avg("Accuracy"), 2) from attempts), 0),
    'active_seconds', coalesce((select sum("ElapsedSeconds") from attempts), 0),
    'answered_logs', coalesce((select count(*) from logs where "Status" in ('answered', 'changed_answer', 'correct', 'incorrect', 'submitted')), 0),
    'last_activity_at', (select max("TimeStamp") from logs),
    'subjects', coalesce((select items from subject_stats), '[]'::jsonb)
  );
$$;

create or replace function public.get_leaderboard(p_limit integer default 20)
returns table (
  rank_position integer,
  public_id uuid,
  display_name text,
  ranking_points bigint,
  attempts_count integer,
  accuracy_avg numeric,
  active_seconds bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (order by p."RankingPoints" desc, p."AccuracyAvg" desc, p."ActiveSeconds" asc)::integer as rank_position,
    p."PublicID" as public_id,
    p."DisplayName" as display_name,
    p."RankingPoints" as ranking_points,
    p."AttemptsCount" as attempts_count,
    p."AccuracyAvg" as accuracy_avg,
    p."ActiveSeconds" as active_seconds,
    p."UpdatedAt" as updated_at
  from public."Profile" p
  where p."AttemptsCount" > 0
  order by p."RankingPoints" desc, p."AccuracyAvg" desc, p."ActiveSeconds" asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.upsert_profile_service(uuid, text) from public, anon, authenticated;
revoke all on function public.list_tests_service() from public, anon, authenticated;
revoke all on function public.get_test_questions_service(uuid) from public, anon, authenticated;
revoke all on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_attempt_history_service(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_dashboard_summary_service(uuid) from public, anon, authenticated;
revoke all on function public.get_leaderboard(integer) from public, anon, authenticated;

grant execute on function public.upsert_profile_service(uuid, text) to service_role;
grant execute on function public.list_tests_service() to service_role;
grant execute on function public.get_test_questions_service(uuid) to service_role;
grant execute on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, integer, text) to service_role;
grant execute on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) to service_role;
grant execute on function public.get_attempt_history_service(uuid, integer) to service_role;
grant execute on function public.get_dashboard_summary_service(uuid) to service_role;
grant execute on function public.get_leaderboard(integer) to service_role;
