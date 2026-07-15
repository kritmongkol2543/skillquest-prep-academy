-- Randomise each exam session without breaking grading.
--
-- The order is deterministic per TestID so a running session can safely reload
-- its question payload while keeping the same order. A new Test row gets a new
-- TestID, therefore both question order and answer order change on each fresh
-- attempt. The original Answer.ChoiceIndex is still returned and used for
-- grading, logs, and hints.

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
      row_number() over (
        partition by q."CategoryID"
        order by md5(q."QuestionID"::text || st."TestID"::text)
      )::integer as position
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
        ) order by md5(a."AnswerID"::text || st."TestID"::text || q."QuestionID"::text))
        from public."Answer" a
        where a."QuestionID" = q."QuestionID"
      ), '[]'::jsonb)
    ) order by q.position), '[]'::jsonb)
  )
  from selected_test st
  left join q_rows q on q."CategoryID" = st."CategoryID"
  group by st."TestID", st."Level", st."Duration", st."QuestionCount", st."CategoryID", st."Category", st."SubjectID", st."Subject";
$$;

revoke all on function public.get_test_questions_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_test_questions_service(uuid, uuid) to service_role;
