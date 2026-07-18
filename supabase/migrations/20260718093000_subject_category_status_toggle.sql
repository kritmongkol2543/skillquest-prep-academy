-- Subject/Category Status controls whether an exam level is available to start.
-- Existing rows stay enabled by default so history and current data are preserved.

alter table public."Subject"
  add column if not exists "Status" boolean not null default true;

alter table public."Category"
  add column if not exists "Status" boolean not null default true;

create index if not exists "Subject_Status_idx"
  on public."Subject" ("Status");

create index if not exists "Category_Status_SubjectID_Priority_idx"
  on public."Category" ("Status", "SubjectID", "Priority");

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
      c."Priority",
      s."SubjectID",
      s."Subject",
      count(q."QuestionID")::integer as question_count,
      coalesce(nullif(min(nullif(q."Level", 'EMPTY')), ''), 'ระดับข้อสอบ') as level
    from public."Category" c
    join public."Subject" s on s."SubjectID" = c."SubjectID"
    join public."Question" q on q."CategoryID" = c."CategoryID"
    where c."Status" is true
      and s."Status" is true
    group by c."CategoryID", c."Category", c."Priority", s."SubjectID", s."Subject"
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'test_id', cs."CategoryID",
    'category_id', cs."CategoryID",
    'title', cs."Subject" || ' · ระดับ ' || cs."Category",
    'subject', cs."Subject",
    'subject_id', cs."SubjectID",
    'category', cs."Category",
    'priority', cs."Priority",
    'level', cs.level,
    'duration', greatest(600, cs.question_count * 60),
    'question_count', cs.question_count
  ) order by
    cs."Subject",
    cs."Priority" nulls last,
    cs."Category"
  ), '[]'::jsonb)
  from category_sets cs
  where cs.question_count > 0;
$$;

create or replace function public.start_test_service(
  p_user_id uuid,
  p_category_id uuid,
  p_client_nonce uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category record;
  v_first_question record;
  v_question_count integer;
  v_test public."Test"%rowtype;
  v_active record;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if p_category_id is null then raise exception 'INVALID_CATEGORY'; end if;
  if p_client_nonce is null then raise exception 'INVALID_CLIENT_NONCE'; end if;

  perform pg_catalog.pg_advisory_xact_lock(739241);

  select
    t."TestID",
    t."Subject",
    t."Category",
    t."Status",
    t."StartedAt",
    t."QuestionCount",
    coalesce(stats.answered_count, 0)::integer as answered_count,
    coalesce(stats.touched_questions, 0)::integer as touched_questions,
    coalesce(stats.elapsed_seconds, 0)::integer as elapsed_seconds
  into v_active
  from public."Test" t
  left join lateral (
    select
      count(*) filter (where l."SelectedChoice" is not null) as answered_count,
      count(*) as touched_questions,
      coalesce(sum(l."Duration"), 0) as elapsed_seconds
    from public."Log" l
    where l."TestID" = t."TestID"
  ) stats on true
  where t."Status" in ('in_progress', 'paused')
  order by t."UpdatedAt" desc
  limit 1
  for update of t;

  if found then
    return jsonb_build_object(
      'blocked', true,
      'active_test', jsonb_build_object(
        'test_id', v_active."TestID",
        'title', v_active."Subject" || ' · ' || v_active."Category",
        'subject', v_active."Subject",
        'category', v_active."Category",
        'status', v_active."Status",
        'started_at', v_active."StartedAt",
        'elapsed_seconds', v_active.elapsed_seconds,
        'answered_count', v_active.answered_count,
        'touched_questions', v_active.touched_questions,
        'total_questions', v_active."QuestionCount"
      )
    );
  end if;

  perform public.upsert_profile_service(p_user_id, null);

  select c."CategoryID", c."Category", s."SubjectID", s."Subject"
    into v_category
  from public."Category" c
  join public."Subject" s on s."SubjectID" = c."SubjectID"
  where c."CategoryID" = p_category_id
    and c."Status" is true
    and s."Status" is true;
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

create or replace function public.start_test_service(
  p_user_id uuid,
  p_category_id uuid,
  p_client_nonce uuid,
  p_client_instance_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category record;
  v_first_question record;
  v_question_count integer;
  v_test public."Test"%rowtype;
  v_active record;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if p_category_id is null then raise exception 'INVALID_CATEGORY'; end if;
  if p_client_nonce is null then raise exception 'INVALID_CLIENT_NONCE'; end if;
  if p_client_instance_id is null then raise exception 'INVALID_CLIENT_INSTANCE'; end if;

  perform pg_catalog.pg_advisory_xact_lock(739241);
  perform public.expire_stale_test_sessions();

  select
    t."TestID", t."Subject", regexp_replace(t."Category", '^ชุดที่\s+', '') as "Category",
    t."Status", t."StartedAt", t."QuestionCount",
    coalesce(stats.answered_count, 0)::integer as answered_count,
    coalesce(stats.touched_questions, 0)::integer as touched_questions,
    coalesce(stats.elapsed_seconds, 0)::integer as elapsed_seconds
  into v_active
  from public."Test" t
  left join lateral (
    select
      count(*) filter (where l."SelectedChoice" is not null) as answered_count,
      count(*) as touched_questions,
      coalesce(sum(l."Duration"), 0) as elapsed_seconds
    from public."Log" l
    where l."TestID" = t."TestID"
  ) stats on true
  where t."Status" in ('in_progress', 'paused')
  order by t."HeartbeatAt" desc nulls last, t."UpdatedAt" desc
  limit 1
  for update of t;

  if found then
    return jsonb_build_object(
      'blocked', true,
      'active_test', jsonb_build_object(
        'test_id', v_active."TestID",
        'title', v_active."Subject" || ' · ระดับ ' || v_active."Category",
        'subject', v_active."Subject",
        'category', v_active."Category",
        'status', v_active."Status",
        'started_at', v_active."StartedAt",
        'elapsed_seconds', v_active.elapsed_seconds,
        'answered_count', v_active.answered_count,
        'touched_questions', v_active.touched_questions,
        'total_questions', v_active."QuestionCount"
      )
    );
  end if;

  perform public.upsert_profile_service(p_user_id, null);

  select c."CategoryID", c."Category", s."SubjectID", s."Subject"
    into v_category
  from public."Category" c
  join public."Subject" s on s."SubjectID" = c."SubjectID"
  where c."CategoryID" = p_category_id
    and c."Status" is true
    and s."Status" is true;
  if not found then raise exception 'CATEGORY_NOT_AVAILABLE'; end if;

  select q."QuestionID", coalesce(nullif(nullif(q."Level", 'EMPTY'), ''), 'ระดับข้อสอบ') as level
    into v_first_question
  from public."Question" q
  where q."CategoryID" = p_category_id
  order by q."QuestionID"
  limit 1;
  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

  select count(*)::integer into v_question_count
  from public."Question" q
  where q."CategoryID" = p_category_id;

  insert into public."Test" (
    "QuestionID", "Subject", "Category", "Level", "Duration", "CategoryID", "QuestionCount",
    "UserID", "ClientNonce", "ClientInstanceID", "Status", "StartedAt", "HeartbeatAt", "UpdatedAt"
  ) values (
    v_first_question."QuestionID", v_category."Subject", v_category."Category",
    v_first_question.level, greatest(600, v_question_count * 60), p_category_id, v_question_count,
    p_user_id, p_client_nonce, p_client_instance_id, 'in_progress', now(), now(), now()
  ) returning * into v_test;

  return jsonb_build_object(
    'test_id', v_test."TestID", 'category_id', v_test."CategoryID",
    'title', v_category."Subject" || ' · ระดับ ' || v_category."Category",
    'subject', v_category."Subject", 'subject_id', v_category."SubjectID",
    'category', v_category."Category", 'level', v_test."Level",
    'duration', v_test."Duration", 'question_count', v_test."QuestionCount", 'status', v_test."Status"
  );
end;
$$;

revoke all on function public.list_tests_service() from public, anon, authenticated;
revoke all on function public.start_test_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_test_service(uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.list_tests_service() to service_role;
grant execute on function public.start_test_service(uuid, uuid, uuid) to service_role;
grant execute on function public.start_test_service(uuid, uuid, uuid, uuid) to service_role;
