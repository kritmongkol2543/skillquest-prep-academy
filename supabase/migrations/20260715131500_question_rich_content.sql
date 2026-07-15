-- Store display-ready exam content in the database instead of relying on
-- spreadsheet cell formatting or frontend-only parsing. Plain text remains the
-- canonical searchable fallback; *Content columns carry structured layout.

alter table public."Question"
  add column if not exists "QuestionContent" jsonb;

alter table public."Answer"
  add column if not exists "AnswerContent" jsonb,
  add column if not exists "ExplanationContent" jsonb;

create or replace function public.build_text_content(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := trim(coalesce(p_text, ''));
  v_work text;
  v_line text;
  v_blocks jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item_text text;
begin
  if v_text = '' then
    return jsonb_build_object('version', 1, 'blocks', '[]'::jsonb);
  end if;

  -- Normalize Excel/CSV line breaks, then split inline Thai exam sub-items like
  -- "1) ... 2) ... 3) ..." into durable list blocks at import time.
  v_work := regexp_replace(v_text, E'\\r\\n?', E'\\n', 'g');
  v_work := regexp_replace(v_work, E'\\s+([0-9]+[.)])\\s+', E'\\n\\1 ', 'g');

  for v_line in
    select trim(value)
    from regexp_split_to_table(v_work, E'\\n+') as value
  loop
    continue when v_line = '';

    if v_line ~ '^[0-9]+[.)]\\s+' then
      v_item_text := trim(regexp_replace(v_line, '^[0-9]+[.)]\\s+', ''));
      if v_item_text <> '' then
        v_items := v_items || jsonb_build_array(jsonb_build_object('text', v_item_text));
      end if;
    else
      if jsonb_array_length(v_items) > 0 then
        v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'ordered_list', 'items', v_items));
        v_items := '[]'::jsonb;
      end if;
      v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', v_line));
    end if;
  end loop;

  if jsonb_array_length(v_items) > 0 then
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'ordered_list', 'items', v_items));
  end if;

  return jsonb_build_object('version', 1, 'blocks', v_blocks);
end;
$$;

create or replace function public.set_question_content_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new."QuestionContent" is null
     or (tg_op = 'UPDATE'
         and new."Question" is distinct from old."Question"
         and new."QuestionContent" is not distinct from old."QuestionContent") then
    new."QuestionContent" := public.build_text_content(new."Question");
  end if;
  return new;
end;
$$;

create or replace function public.set_answer_content_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new."AnswerContent" is null
     or (tg_op = 'UPDATE'
         and new."Answer" is distinct from old."Answer"
         and new."AnswerContent" is not distinct from old."AnswerContent") then
    new."AnswerContent" := public.build_text_content(new."Answer");
  end if;

  if new."Explanation" is not null and (
     new."ExplanationContent" is null
     or (tg_op = 'UPDATE'
         and new."Explanation" is distinct from old."Explanation"
         and new."ExplanationContent" is not distinct from old."ExplanationContent")) then
    new."ExplanationContent" := public.build_text_content(new."Explanation");
  end if;
  return new;
end;
$$;

drop trigger if exists question_content_default on public."Question";
create trigger question_content_default
before insert or update of "Question", "QuestionContent" on public."Question"
for each row execute function public.set_question_content_default();

drop trigger if exists answer_content_default on public."Answer";
create trigger answer_content_default
before insert or update of "Answer", "AnswerContent", "Explanation", "ExplanationContent" on public."Answer"
for each row execute function public.set_answer_content_default();

update public."Question"
set "QuestionContent" = public.build_text_content("Question")
where "QuestionContent" is null;

update public."Answer"
set
  "AnswerContent" = public.build_text_content("Answer"),
  "ExplanationContent" = case when "Explanation" is null then null else public.build_text_content("Explanation") end
where "AnswerContent" is null
   or ("Explanation" is not null and "ExplanationContent" is null);

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
      q."QuestionContent",
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
      'title', st."Subject" || ' · ระดับ ' || st."Category",
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
      'question_content', coalesce(q."QuestionContent", public.build_text_content(q."Question")),
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
          'answer_content', coalesce(a."AnswerContent", public.build_text_content(a."Answer")),
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

revoke all on function public.build_text_content(text) from public, anon, authenticated;
revoke all on function public.get_test_questions_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.build_text_content(text) to service_role;
grant execute on function public.get_test_questions_service(uuid, uuid) to service_role;
