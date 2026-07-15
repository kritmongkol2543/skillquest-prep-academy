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
  where "AttemptID" = p_attempt_id
    and "UserID" = p_user_id;

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
      where h."UserID" = p_user_id
        and h."TestID" = v_attempt."TestID"
        and h."QuestionID" = l."QuestionID"
    ) h on true
    where l."UserID" = p_user_id
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

revoke all on function public.get_attempt_detail_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_attempt_detail_service(uuid, uuid) to service_role;
