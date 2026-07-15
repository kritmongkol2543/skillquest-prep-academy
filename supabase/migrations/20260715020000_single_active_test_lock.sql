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
  v_active record;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if p_category_id is null then raise exception 'INVALID_CATEGORY'; end if;
  if p_client_nonce is null then raise exception 'INVALID_CLIENT_NONCE'; end if;

  -- One shared practice desk: serialise every start before checking availability.
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

create or replace function public.cancel_test_service(p_user_id uuid, p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test public."Test"%rowtype;
begin
  select * into v_test
  from public."Test"
  where "TestID" = p_test_id and "UserID" = p_user_id
  for update;

  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;
  if v_test."Status" in ('submitted', 'catalog_legacy') then raise exception 'SET_NOT_ACTIVE'; end if;

  if v_test."Status" <> 'cancelled' then
    update public."Test"
    set "Status" = 'cancelled', "CancelledAt" = now(), "UpdatedAt" = now()
    where "TestID" = p_test_id
    returning * into v_test;
  end if;

  return jsonb_build_object(
    'test_id', v_test."TestID",
    'status', v_test."Status",
    'cancelled_at', coalesce(v_test."CancelledAt", now())
  );
end;
$$;

revoke all on function public.start_test_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_test_service(uuid, uuid, uuid) to service_role;
revoke all on function public.cancel_test_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_test_service(uuid, uuid) to service_role;
