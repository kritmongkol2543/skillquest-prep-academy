create or replace function public.get_exam_set_for_edit_service(p_category_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category record;
  v_questions jsonb;
begin
  if p_category_id is null then raise exception 'INVALID_CATEGORY'; end if;

  select c."CategoryID", c."Category", c."SubjectID", c."Status", c."IsCustomSet"
    into v_category
  from public."Category" c
  where c."CategoryID" = p_category_id;

  if not found or v_category."IsCustomSet" is not true then
    raise exception 'EDIT_SET_NOT_AVAILABLE';
  end if;
  if v_category."Status" is not true then
    raise exception 'EDIT_SET_SUPERSEDED';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'question_id', q."QuestionID",
      'question', q."Question",
      'image', q."ImageLink",
      'level', q."Level",
      'explanation', coalesce((
        select a."Explanation"
        from public."Answer" a
        where a."QuestionID" = q."QuestionID" and a."Status" is true
        order by a."ChoiceIndex"
        limit 1
      ), ''),
      'choices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'answer_id', a."AnswerID",
          'choice_index', a."ChoiceIndex",
          'text', a."Answer",
          'image', a."Image",
          'correct', a."Status"
        ) order by a."ChoiceIndex")
        from public."Answer" a
        where a."QuestionID" = q."QuestionID"
      ), '[]'::jsonb)
    ) order by q."QuestionID"
  ), '[]'::jsonb)
  into v_questions
  from public."Question" q
  where q."CategoryID" = p_category_id;

  return jsonb_build_object(
    'category_id', v_category."CategoryID",
    'title', v_category."Category",
    'subject_id', v_category."SubjectID",
    'questions', v_questions
  );
end;
$$;

revoke all on function public.get_exam_set_for_edit_service(uuid) from public, anon, authenticated;
grant execute on function public.get_exam_set_for_edit_service(uuid) to service_role;
