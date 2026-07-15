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
    select l.*
    from public."Log" l
    join attempts a on a."TestID" = l."TestID" and a."UserID" = l."UserID"
    where l."UserID" = p_user_id
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
    where "UserID" = p_user_id
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
    join attempts a on a."TestID" = l."TestID" and a."UserID" = l."UserID"
    join public."Subject" s on s."SubjectID" = l."SubjectID"
    join public."Category" c on c."CategoryID" = l."CategoryID"
    where l."UserID" = p_user_id
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

revoke all on function public.get_dashboard_summary_service(uuid) from public, anon, authenticated;
revoke all on function public.get_learning_insights_service(uuid) from public, anon, authenticated;
grant execute on function public.get_dashboard_summary_service(uuid) to service_role;
grant execute on function public.get_learning_insights_service(uuid) to service_role;
