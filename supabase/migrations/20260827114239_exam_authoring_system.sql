alter table public."Category"
  add column if not exists "IsCustomSet" boolean not null default false,
  add column if not exists "CreatedAt" timestamptz not null default now(),
  add column if not exists "CreatedBy" uuid null references auth.users(id) on delete set null;

alter table public."Answer" drop constraint if exists "Answer_ChoiceIndex_check";
alter table public."Answer" add constraint "Answer_ChoiceIndex_check" check ("ChoiceIndex" >= 0);

alter table public."Log" drop constraint if exists "Log_SelectedChoice_check";
alter table public."Log" add constraint "Log_SelectedChoice_check" check ("SelectedChoice" is null or "SelectedChoice" >= 0);

create table if not exists public."ExamAuthoringAdmin" (
  "ID" smallint primary key default 1 check ("ID" = 1),
  "CodeHash" text not null check (length("CodeHash") = 64),
  "UpdatedAt" timestamptz not null default now()
);
alter table public."ExamAuthoringAdmin" enable row level security;
revoke all on table public."ExamAuthoringAdmin" from anon, authenticated;

create table if not exists public."ExamAuthoringSession" (
  "SessionID" uuid primary key default gen_random_uuid(),
  "UserID" uuid not null references auth.users(id) on delete cascade,
  "TokenHash" text not null unique check (length("TokenHash") = 64),
  "ExpiresAt" timestamptz not null,
  "CreatedAt" timestamptz not null default now(),
  "LastUsedAt" timestamptz not null default now()
);
alter table public."ExamAuthoringSession" enable row level security;
revoke all on table public."ExamAuthoringSession" from anon, authenticated;
create index if not exists "ExamAuthoringSession_UserID_ExpiresAt_idx"
  on public."ExamAuthoringSession" ("UserID", "ExpiresAt" desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exam-images',
  'exam-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

create or replace function public.create_exam_set_service(
  p_subject_id uuid,
  p_title text,
  p_questions jsonb,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_category_id uuid;
  v_priority numeric;
  v_question jsonb;
  v_question_id uuid;
  v_question_text text;
  v_question_image text;
  v_level text;
  v_explanation text;
  v_choices jsonb;
  v_choice jsonb;
  v_choice_index integer;
  v_choice_text text;
  v_choice_image text;
  v_correct_count integer;
  v_question_count integer := 0;
  v_choice_total integer := 0;
begin
  if p_subject_id is null then raise exception 'INVALID_SUBJECT'; end if;
  if p_created_by is null then raise exception 'INVALID_AUTHOR'; end if;

  p_title := trim(coalesce(p_title, ''));
  if length(p_title) < 1 or length(p_title) > 120 then raise exception 'INVALID_TITLE'; end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) < 1 then
    raise exception 'INVALID_QUESTIONS';
  end if;
  if jsonb_array_length(p_questions) > 500 then raise exception 'TOO_MANY_QUESTIONS'; end if;

  select s."Subject" into v_subject
  from public."Subject" s
  where s."SubjectID" = p_subject_id and s."Status" is true;
  if not found then raise exception 'SUBJECT_NOT_AVAILABLE'; end if;

  if exists (
    select 1
    from public."Category" c
    where c."SubjectID" = p_subject_id
      and c."Status" is true
      and lower(trim(c."Category")) = lower(p_title)
  ) then
    raise exception 'SET_TITLE_EXISTS';
  end if;

  select coalesce(max(c."Priority"), 0) + 1 into v_priority
  from public."Category" c
  where c."SubjectID" = p_subject_id;

  insert into public."Category" ("Category", "SubjectID", "Priority", "Status", "IsCustomSet", "CreatedBy")
  values (p_title, p_subject_id, v_priority, true, true, p_created_by)
  returning "CategoryID" into v_category_id;

  for v_question in select value from jsonb_array_elements(p_questions)
  loop
    if jsonb_typeof(v_question) <> 'object' then raise exception 'INVALID_QUESTION'; end if;

    v_question_text := trim(coalesce(v_question->>'question', ''));
    v_question_image := nullif(trim(coalesce(v_question->>'image', '')), '');
    v_level := coalesce(nullif(trim(coalesce(v_question->>'level', '')), ''), 'ระดับข้อสอบ');
    v_explanation := nullif(trim(coalesce(v_question->>'explanation', '')), '');
    v_choices := v_question->'choices';

    if v_question_text = '' and v_question_image is null then raise exception 'QUESTION_CONTENT_REQUIRED'; end if;
    if length(v_question_text) > 8000 then raise exception 'QUESTION_TOO_LONG'; end if;
    if length(v_level) > 120 then raise exception 'LEVEL_TOO_LONG'; end if;

    if v_choices is null or jsonb_typeof(v_choices) <> 'array' or jsonb_array_length(v_choices) < 2 then
      raise exception 'AT_LEAST_TWO_CHOICES_REQUIRED';
    end if;
    if jsonb_array_length(v_choices) > 32767 then raise exception 'TOO_MANY_CHOICES'; end if;

    select count(*)::integer into v_correct_count
    from jsonb_array_elements(v_choices) c
    where c->>'correct' = 'true';
    if v_correct_count <> 1 then raise exception 'EXACTLY_ONE_CORRECT_CHOICE_REQUIRED'; end if;

    insert into public."Question" (
      "Question", "SubjectID", "CategoryID", "Level", "ImageLink", "QuestionContent"
    ) values (
      v_question_text, p_subject_id, v_category_id, v_level, v_question_image, null
    ) returning "QuestionID" into v_question_id;

    v_choice_index := 0;
    for v_choice in select value from jsonb_array_elements(v_choices)
    loop
      if jsonb_typeof(v_choice) <> 'object' then raise exception 'INVALID_CHOICE'; end if;
      v_choice_text := trim(coalesce(v_choice->>'text', ''));
      v_choice_image := nullif(trim(coalesce(v_choice->>'image', '')), '');
      if v_choice_text = '' and v_choice_image is null then raise exception 'CHOICE_CONTENT_REQUIRED'; end if;
      if length(v_choice_text) > 4000 then raise exception 'CHOICE_TOO_LONG'; end if;

      insert into public."Answer" (
        "QuestionID", "ChoiceIndex", "Answer", "Status", "Image", "Explanation", "AnswerContent", "ExplanationContent"
      ) values (
        v_question_id,
        v_choice_index,
        v_choice_text,
        (v_choice->>'correct' = 'true'),
        v_choice_image,
        case when v_choice->>'correct' = 'true' then v_explanation else null end,
        null,
        null
      );

      v_choice_index := v_choice_index + 1;
      v_choice_total := v_choice_total + 1;
    end loop;

    v_question_count := v_question_count + 1;
  end loop;

  return jsonb_build_object(
    'category_id', v_category_id,
    'title', p_title,
    'subject_id', p_subject_id,
    'subject', v_subject,
    'question_count', v_question_count,
    'choice_count', v_choice_total
  );
end;
$$;
revoke all on function public.create_exam_set_service(uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.create_exam_set_service(uuid,text,jsonb,uuid) to service_role;

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
  if p_selected_choice is not null and p_selected_choice < 0 then raise exception 'INVALID_CHOICE'; end if;

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
  ) values (
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
    if v_item.choice_index < 0 then raise exception 'INVALID_CHOICE'; end if;

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
  ) values (
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
