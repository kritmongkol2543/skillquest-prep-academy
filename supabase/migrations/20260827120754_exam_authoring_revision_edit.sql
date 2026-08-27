alter table public."Category"
  add column if not exists "RevisionOf" uuid null references public."Category"("CategoryID") on delete set null;

create index if not exists "Category_RevisionOf_idx"
  on public."Category" ("RevisionOf") where "RevisionOf" is not null;

create or replace function public.update_exam_set_service(
  p_category_id uuid,
  p_subject_id uuid,
  p_title text,
  p_questions jsonb,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public."Category"%rowtype;
  v_created jsonb;
  v_new_category_id uuid;
begin
  if p_category_id is null then raise exception 'INVALID_CATEGORY'; end if;
  if p_created_by is null then raise exception 'INVALID_AUTHOR'; end if;

  select * into v_source
  from public."Category"
  where "CategoryID" = p_category_id
  for update;

  if not found or v_source."IsCustomSet" is not true then
    raise exception 'EDIT_SET_NOT_AVAILABLE';
  end if;

  if v_source."Status" is not true then
    raise exception 'EDIT_SET_SUPERSEDED';
  end if;

  -- Version-safe edit: remove only the old revision from the catalog.
  -- Questions/answers remain untouched so active tests and historical logs keep
  -- referencing the exact content they started with.
  update public."Category"
  set "Status" = false
  where "CategoryID" = p_category_id;

  v_created := public.create_exam_set_service(
    p_subject_id,
    p_title,
    p_questions,
    p_created_by
  );

  v_new_category_id := (v_created->>'category_id')::uuid;

  update public."Category"
  set "RevisionOf" = p_category_id
  where "CategoryID" = v_new_category_id;

  return v_created || jsonb_build_object(
    'previous_category_id', p_category_id,
    'edited', true
  );
end;
$$;

revoke all on function public.update_exam_set_service(uuid,uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.update_exam_set_service(uuid,uuid,text,jsonb,uuid) to service_role;
