-- Category now represents exam difficulty level (Basic, Normal, Intermediate,
-- Advanced, Expert, Master), not a numbered set. Keep the column names for
-- compatibility, but make all service copy and new Test rows speak in terms of
-- "ระดับ".

update public."Test"
set "Category" = regexp_replace("Category", '^ชุดที่\s+', '')
where "Category" ~ '^ชุดที่\s+';

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
      coalesce(nullif(min(nullif(q."Level", 'EMPTY')), ''), 'ระดับข้อสอบ') as level
    from public."Category" c
    join public."Subject" s on s."SubjectID" = c."SubjectID"
    join public."Question" q on q."CategoryID" = c."CategoryID"
    group by c."CategoryID", c."Category", s."SubjectID", s."Subject"
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'test_id', cs."CategoryID",
    'category_id', cs."CategoryID",
    'title', cs."Subject" || ' · ระดับ ' || cs."Category",
    'subject', cs."Subject",
    'subject_id', cs."SubjectID",
    'category', cs."Category",
    'level', cs.level,
    'duration', greatest(600, cs.question_count * 60),
    'question_count', cs.question_count
  ) order by cs."Subject",
    case lower(cs."Category")
      when 'basic' then 1
      when 'normal' then 2
      when 'intermediate' then 3
      when 'advanced' then 4
      when 'expert' then 5
      when 'master' then 6
      else 99
    end,
    cs."Category"
  ), '[]'::jsonb)
  from category_sets cs
  where cs.question_count > 0;
$$;

create or replace function public.start_test_service(
  p_user_id uuid,
  p_category_id uuid,
  p_client_nonce uuid,
  p_client_instance_id uuid
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
  where c."CategoryID" = p_category_id;
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
    'Test', jsonb_build_object('Question', s."Subject" || ' · ระดับ ' || c."Category", 'Subject', s."Subject")
  ) order by a."SubmittedAt" desc), '[]'::jsonb)
  from (
    select *
    from public."Attempt" a
    order by a."SubmittedAt" desc
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  ) a
  join public."Test" t on t."TestID" = a."TestID"
  join public."Category" c on c."CategoryID" = t."CategoryID"
  join public."Subject" s on s."SubjectID" = c."SubjectID";
$$;

create or replace function public.get_learning_insights_service(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with attempts as (
    select *
    from public."Attempt"
  ),
  logs as (
    select
      l."LogID",
      l."TestID",
      l."QuestionID",
      l."Question",
      l."SubjectID",
      l."CategoryID",
      l."Status",
      l."Duration",
      l."TimeStamp",
      s."Subject",
      c."Category"
    from public."Log" l
    join attempts a
      on a."TestID" = l."TestID"
     and a."UserID" = l."UserID"
     and a."ClientNonce" = l."ClientNonce"
    join public."Subject" s on s."SubjectID" = l."SubjectID"
    join public."Category" c on c."CategoryID" = l."CategoryID"
  ),
  overview as (
    select
      coalesce((select count(distinct "QuestionID") from logs), 0)::integer as questions_seen,
      coalesce((select sum("Duration") from logs), 0)::bigint as total_question_seconds,
      coalesce((select round(avg(nullif("Duration", 0))) from logs), 0)::integer as avg_seconds_per_question,
      coalesce((select percentile_disc(0.5) within group (order by nullif("Duration", 0)) from logs), 0)::integer as median_seconds_per_question,
      coalesce((select count(distinct "AttemptID") from attempts), 0)::integer as attempts_count,
      coalesce((select round(avg("Accuracy"), 2) from attempts), 0)::numeric as average_accuracy,
      coalesce((select sum("HintCount") from attempts), 0)::integer as hint_count,
      (select max("TimeStamp") from logs) as last_activity_at
  ),
  subject_rows as (
    select
      l."Subject" as subject,
      count(distinct l."QuestionID")::integer as questions_seen,
      coalesce(sum(l."Duration"), 0)::bigint as total_seconds,
      coalesce(round(avg(nullif(l."Duration", 0))), 0)::integer as avg_seconds,
      coalesce(round(100.0 * count(*) filter (where l."Status" = 'correct') / nullif(count(*) filter (where l."Status" in ('correct', 'incorrect')), 0), 2), 0)::numeric as accuracy,
      count(*) filter (where l."Status" = 'incorrect')::integer as wrong_count,
      count(*) filter (where l."Status" in ('correct', 'incorrect'))::integer as scored_count
    from logs l
    group by l."Subject"
  ),
  category_rows as (
    select
      l."Subject" as subject,
      l."Category" as category,
      count(distinct l."QuestionID")::integer as questions_seen,
      coalesce(sum(l."Duration"), 0)::bigint as total_seconds,
      coalesce(round(avg(nullif(l."Duration", 0))), 0)::integer as avg_seconds,
      coalesce(round(100.0 * count(*) filter (where l."Status" = 'correct') / nullif(count(*) filter (where l."Status" in ('correct', 'incorrect')), 0), 2), 0)::numeric as accuracy,
      count(*) filter (where l."Status" = 'incorrect')::integer as wrong_count,
      count(*) filter (where l."Status" in ('correct', 'incorrect'))::integer as scored_count
    from logs l
    group by l."Subject", l."Category"
  ),
  slow_questions as (
    select
      l."QuestionID" as question_id,
      left(l."Question", 160) as question,
      l."Subject" as subject,
      l."Category" as category,
      l."Duration"::integer as duration_seconds,
      l."Status" as status,
      case
        when l."Status" = 'incorrect' and l."Duration" >= 90 then 'ช้าและยังตอบผิด ควรกลับไปทบทวนละเอียด'
        when l."Status" = 'incorrect' then 'ตอบผิด ควรทบทวนแนวคิดหลัก'
        when l."Duration" >= 120 then 'ใช้เวลานาน แม้ตอบถูกควรหาวิธีทำให้เร็วขึ้น'
        else 'ใช้เวลามากกว่าค่าเฉลี่ย'
      end as reason
    from logs l
    where l."Duration" > 0
    order by
      case when l."Status" = 'incorrect' then 0 else 1 end,
      l."Duration" desc,
      l."TimeStamp" desc
    limit 8
  ),
  weakest_category as (
    select *
    from category_rows
    where scored_count >= 1
    order by accuracy asc, wrong_count desc, avg_seconds desc
    limit 1
  ),
  slowest_category as (
    select *
    from category_rows
    where questions_seen >= 1
    order by avg_seconds desc, total_seconds desc
    limit 1
  ),
  ready_category as (
    select *
    from category_rows
    where scored_count >= 1 and accuracy >= 80 and avg_seconds <= 75
    order by
      case lower(category)
        when 'basic' then 1
        when 'normal' then 2
        when 'intermediate' then 3
        when 'advanced' then 4
        when 'expert' then 5
        when 'master' then 6
        else 99
      end desc
    limit 1
  ),
  recommendations as (
    select coalesce(jsonb_agg(item), '[]'::jsonb) as items
    from (
      select jsonb_build_object(
        'type', 'accuracy',
        'title', 'ระดับที่ควรซ่อมความแม่นยำ',
        'body', wc.subject || ' · ระดับ ' || wc.category || ' มีความแม่นยำ ' || wc.accuracy || '% จากข้อที่ตรวจแล้ว',
        'priority', case when wc.accuracy < 60 then 'high' else 'medium' end
      ) as item
      from weakest_category wc
      union all
      select jsonb_build_object(
        'type', 'speed',
        'title', 'ระดับที่ใช้เวลามากที่สุด',
        'body', sc.subject || ' · ระดับ ' || sc.category || ' เฉลี่ย ' || sc.avg_seconds || ' วินาทีต่อข้อ',
        'priority', case when sc.avg_seconds >= 120 then 'high' else 'medium' end
      ) as item
      from slowest_category sc
      union all
      select jsonb_build_object(
        'type', 'accuracy',
        'title', 'ระดับที่เริ่มพร้อมขยับต่อ',
        'body', rc.subject || ' · ระดับ ' || rc.category || ' ทำได้นิ่งแล้ว ลองทดสอบระดับถัดไปเมื่อพร้อม',
        'priority', 'low'
      ) as item
      from ready_category rc
    ) x
  )
  select jsonb_build_object(
    'overview', jsonb_build_object(
      'questions_seen', (select questions_seen from overview),
      'total_question_seconds', (select total_question_seconds from overview),
      'avg_seconds_per_question', (select avg_seconds_per_question from overview),
      'median_seconds_per_question', (select median_seconds_per_question from overview),
      'attempts_count', (select attempts_count from overview),
      'average_accuracy', (select average_accuracy from overview),
      'hint_count', (select hint_count from overview),
      'last_activity_at', (select last_activity_at from overview)
    ),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject,
        'questions_seen', questions_seen,
        'total_seconds', total_seconds,
        'avg_seconds', avg_seconds,
        'accuracy', accuracy,
        'wrong_count', wrong_count,
        'scored_count', scored_count
      ) order by total_seconds desc, subject)
      from subject_rows
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject,
        'category', category,
        'questions_seen', questions_seen,
        'total_seconds', total_seconds,
        'avg_seconds', avg_seconds,
        'accuracy', accuracy,
        'wrong_count', wrong_count,
        'scored_count', scored_count
      ) order by
        case lower(category)
          when 'basic' then 1
          when 'normal' then 2
          when 'intermediate' then 3
          when 'advanced' then 4
          when 'expert' then 5
          when 'master' then 6
          else 99
        end,
        subject, category)
      from category_rows
      limit 12
    ), '[]'::jsonb),
    'slow_questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', question_id,
        'question', question,
        'subject', subject,
        'category', category,
        'duration_seconds', duration_seconds,
        'status', status,
        'reason', reason
      ) order by duration_seconds desc)
      from slow_questions
    ), '[]'::jsonb),
    'recommendations', (select items from recommendations)
  );
$$;

revoke all on function public.list_tests_service() from public, anon, authenticated;
revoke all on function public.start_test_service(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_attempt_history_service(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_learning_insights_service(uuid) from public, anon, authenticated;

grant execute on function public.list_tests_service() to service_role;
grant execute on function public.start_test_service(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.get_attempt_history_service(uuid, integer) to service_role;
grant execute on function public.get_learning_insights_service(uuid) to service_role;
