-- SkillQuest is intentionally a single-user training kiosk. Supabase anonymous
-- auth still creates a different auth.users row per device, so analytics that
-- filtered by UserID made desktop and phone look like separate students.
--
-- Keep writes and active-test ownership device-scoped for safe cancellation and
-- heartbeat validation, but make read-side dashboards/history aggregate every
-- successfully submitted attempt in this project. The existing global
-- start_test_service lock still prevents overlapping active tests.

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
  ),
  logs as (
    select l.*
    from public."Log" l
    join attempts a
      on a."TestID" = l."TestID"
     and a."UserID" = l."UserID"
     and a."ClientNonce" = l."ClientNonce"
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
  fastest_risky_category as (
    select *
    from category_rows
    where scored_count >= 1 and accuracy < 70 and avg_seconds <= 60
    order by accuracy asc, avg_seconds asc
    limit 1
  ),
  recommendations as (
    select coalesce(jsonb_agg(item), '[]'::jsonb) as items
    from (
      select jsonb_build_object(
        'type', 'accuracy',
        'title', 'หมวดที่ควรซ่อมความแม่นยำ',
        'body', wc.subject || ' · ชุดที่ ' || wc.category || ' มีความแม่นยำ ' || wc.accuracy || '% จากข้อที่ตรวจแล้ว',
        'priority', case when wc.accuracy < 60 then 'high' else 'medium' end
      ) as item
      from weakest_category wc
      union all
      select jsonb_build_object(
        'type', 'speed',
        'title', 'หมวดที่ใช้เวลามากที่สุด',
        'body', sc.subject || ' · ชุดที่ ' || sc.category || ' เฉลี่ย ' || sc.avg_seconds || ' วินาทีต่อข้อ',
        'priority', case when sc.avg_seconds >= 120 then 'high' else 'medium' end
      ) as item
      from slowest_category sc
      union all
      select jsonb_build_object(
        'type', 'careless',
        'title', 'เสี่ยงพลาดเพราะทำเร็ว',
        'body', fr.subject || ' · ชุดที่ ' || fr.category || ' ทำเร็วแต่ความแม่นยำยังต่ำ ควรชะลอและตรวจโจทย์',
        'priority', 'medium'
      ) as item
      from fastest_risky_category fr
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
      ) order by wrong_count desc, avg_seconds desc, total_seconds desc, subject, category)
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

create or replace function public.get_attempt_detail_service(p_user_id uuid, p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_attempt public."Attempt"%rowtype;
  v_result jsonb;
begin
  select * into v_attempt
  from public."Attempt"
  where "AttemptID" = p_attempt_id;

  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  with test_row as (
    select
      t."TestID",
      t."CategoryID",
      coalesce(s."Subject", t."Subject") as subject,
      coalesce(c."Category", t."Category") as category
    from public."Test" t
    left join public."Category" c on c."CategoryID" = t."CategoryID"
    left join public."Subject" s on s."SubjectID" = c."SubjectID"
    where t."TestID" = v_attempt."TestID"
  ),
  q_positions as (
    select
      q."QuestionID",
      row_number() over (partition by q."CategoryID" order by q."QuestionID")::integer as position
    from public."Question" q
    join test_row tr on tr."CategoryID" = q."CategoryID"
  ),
  log_rows as (
    select
      l."LogID",
      l."QuestionID",
      coalesce(qp.position, row_number() over (order by l."TimeStamp", l."LogID")::integer) as position,
      l."Question",
      coalesce(s."Subject", tr.subject) as subject,
      coalesce(c."Category", tr.category) as category,
      coalesce(nullif(nullif(l."Level", 'EMPTY'), ''), 'ชุดฝึกสอบ') as level,
      coalesce(l."Duration", 0)::integer as duration_seconds,
      l."Status",
      l."SelectedChoice",
      l."AnswerID" as selected_answer_id,
      l."Answer" as selected_answer,
      coalesce(nullif(l."Explanation", ''), selected_answer."Explanation", correct_answer."Explanation") as explanation,
      correct_answer."AnswerID" as correct_answer_id,
      correct_answer."ChoiceIndex"::integer as correct_choice,
      correct_answer."Answer" as correct_answer,
      coalesce(h.hint_count, 0)::integer as hint_count
    from public."Log" l
    join test_row tr on tr."TestID" = l."TestID"
    left join q_positions qp on qp."QuestionID" = l."QuestionID"
    left join public."Subject" s on s."SubjectID" = l."SubjectID"
    left join public."Category" c on c."CategoryID" = l."CategoryID"
    left join public."Answer" selected_answer on selected_answer."AnswerID" = l."AnswerID"
    left join lateral (
      select a."AnswerID", a."ChoiceIndex", a."Answer", a."Explanation"
      from public."Answer" a
      where a."QuestionID" = l."QuestionID"
        and a."Status" = true
      order by a."ChoiceIndex"
      limit 1
    ) correct_answer on true
    left join lateral (
      select count(*)::integer as hint_count
      from public."Hint" h
      where h."UserID" = v_attempt."UserID"
        and h."ClientNonce" = v_attempt."ClientNonce"
        and h."TestID" = v_attempt."TestID"
        and h."QuestionID" = l."QuestionID"
    ) h on true
    where l."UserID" = v_attempt."UserID"
      and l."ClientNonce" = v_attempt."ClientNonce"
      and l."TestID" = v_attempt."TestID"
      and l."Status" in ('correct', 'incorrect', 'answered', 'changed_answer', 'skipped', 'submitted')
  ),
  summary as (
    select
      coalesce(count(*) filter (where "Status" = 'correct'), 0)::integer as correct_count,
      coalesce(count(*) filter (where "Status" = 'incorrect'), 0)::integer as wrong_count,
      greatest(v_attempt."TotalQuestions" - coalesce(count(*), 0), 0)::integer as unanswered_count,
      coalesce(count(*), 0)::integer as logged_questions,
      coalesce(round(avg(nullif(duration_seconds, 0))), 0)::integer as avg_seconds_per_question,
      coalesce(max(duration_seconds), 0)::integer as slowest_seconds,
      coalesce(min(nullif(duration_seconds, 0)), 0)::integer as fastest_seconds,
      coalesce(sum(duration_seconds), 0)::integer as total_log_seconds
    from log_rows
  )
  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'attempt_id', v_attempt."AttemptID",
      'test_id', v_attempt."TestID",
      'title', tr.subject || ' · ชุดที่ ' || tr.category,
      'subject', tr.subject,
      'category', tr.category,
      'correct_count', v_attempt."CorrectCount",
      'answered_count', v_attempt."AnsweredCount",
      'total_questions', v_attempt."TotalQuestions",
      'accuracy', v_attempt."Accuracy",
      'score', v_attempt."Score",
      'hint_count', v_attempt."HintCount",
      'hint_penalty', v_attempt."HintPenalty",
      'elapsed_seconds', v_attempt."ElapsedSeconds",
      'submitted_at', v_attempt."SubmittedAt"
    ),
    'summary', jsonb_build_object(
      'correct_count', s.correct_count,
      'wrong_count', s.wrong_count,
      'unanswered_count', s.unanswered_count,
      'logged_questions', s.logged_questions,
      'avg_seconds_per_question', s.avg_seconds_per_question,
      'slowest_seconds', s.slowest_seconds,
      'fastest_seconds', s.fastest_seconds,
      'total_log_seconds', s.total_log_seconds
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'log_id', lr."LogID",
        'question_id', lr."QuestionID",
        'position', lr.position,
        'question', lr."Question",
        'subject', lr.subject,
        'category', lr.category,
        'level', lr.level,
        'duration_seconds', lr.duration_seconds,
        'status', lr."Status",
        'selected_choice', lr."SelectedChoice",
        'selected_answer_id', lr.selected_answer_id,
        'selected_answer', lr.selected_answer,
        'correct_answer_id', lr.correct_answer_id,
        'correct_choice', lr.correct_choice,
        'correct_answer', lr.correct_answer,
        'explanation', lr.explanation,
        'hint_count', lr.hint_count,
        'used_hint', lr.hint_count > 0
      ) order by lr.position)
      from log_rows lr
    ), '[]'::jsonb)
  )
  into v_result
  from test_row tr
  cross join summary s;

  return v_result;
end;
$$;

revoke all on function public.get_attempt_history_service(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_dashboard_summary_service(uuid) from public, anon, authenticated;
revoke all on function public.get_learning_insights_service(uuid) from public, anon, authenticated;
revoke all on function public.get_attempt_detail_service(uuid, uuid) from public, anon, authenticated;

grant execute on function public.get_attempt_history_service(uuid, integer) to service_role;
grant execute on function public.get_dashboard_summary_service(uuid) to service_role;
grant execute on function public.get_learning_insights_service(uuid) to service_role;
grant execute on function public.get_attempt_detail_service(uuid, uuid) to service_role;
