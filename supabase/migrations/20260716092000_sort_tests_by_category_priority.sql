-- Category.Priority is the canonical ordering for the level dropdown.

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

revoke all on function public.list_tests_service() from public, anon, authenticated;
grant execute on function public.list_tests_service() to service_role;
