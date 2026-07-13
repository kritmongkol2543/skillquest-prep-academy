create extension if not exists pgcrypto with schema extensions;

drop function if exists public.submit_attempt(uuid, jsonb, integer, uuid) cascade;
drop function if exists public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) cascade;
drop function if exists public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, integer, text) cascade;
drop function if exists public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, smallint, text) cascade;
drop function if exists public.use_hint_service(uuid, uuid, uuid, uuid, integer) cascade;
drop function if exists public.get_leaderboard(integer) cascade;

drop table if exists public."Hint" cascade;
drop table if exists public."Log" cascade;
drop table if exists public."Answer" cascade;
drop table if exists public."Question" cascade;
drop table if exists public."Category" cascade;
drop table if exists public."Subject" cascade;
drop table if exists public."Test" cascade;

drop table if exists public.hint_logs cascade;
drop table if exists public.question_logs cascade;
drop table if exists public.attempts cascade;
drop table if exists public.questions cascade;
drop table if exists public.question_sets cascade;
drop table if exists public.profiles cascade;
drop schema if exists private cascade;

create table public."Subject" (
  "SubjectID" uuid primary key default gen_random_uuid(),
  "Subject" text not null unique
);

create table public."Category" (
  "CategoryID" uuid primary key default gen_random_uuid(),
  "Category" text not null,
  "SubjectID" uuid not null references public."Subject" ("SubjectID") on delete restrict,
  unique ("SubjectID", "Category")
);

create table public."Test" (
  "TestID" uuid primary key default gen_random_uuid(),
  "Question" text not null,
  "Subject" text not null,
  "Category" text not null,
  "Level" text not null,
  "TimeStamp" timestamptz not null default now(),
  "Duration" integer not null default 0 check ("Duration" >= 0)
);

create table public."Question" (
  "QuestionID" uuid primary key default gen_random_uuid(),
  "TestID" uuid not null references public."Test" ("TestID") on delete cascade,
  "Question" text not null,
  "SubjectID" uuid not null references public."Subject" ("SubjectID") on delete restrict,
  "CategoryID" uuid not null references public."Category" ("CategoryID") on delete restrict,
  "Level" text not null
);

create table public."Answer" (
  "AnswerID" uuid primary key default gen_random_uuid(),
  "QuestionID" uuid not null references public."Question" ("QuestionID") on delete cascade,
  "ChoiceIndex" smallint not null check ("ChoiceIndex" between 0 and 3),
  "Answer" text not null,
  "Status" text not null check ("Status" in ('correct', 'incorrect')),
  "Image" text,
  "Explanation" text,
  unique ("QuestionID", "ChoiceIndex")
);

create table public."Log" (
  "LogID" uuid primary key default gen_random_uuid(),
  "UserID" uuid not null references auth.users (id) on delete cascade,
  "ClientNonce" uuid not null,
  "TestID" uuid not null references public."Test" ("TestID") on delete cascade,
  "QuestionID" uuid not null references public."Question" ("QuestionID") on delete cascade,
  "Question" text not null,
  "SubjectID" uuid not null references public."Subject" ("SubjectID") on delete restrict,
  "CategoryID" uuid not null references public."Category" ("CategoryID") on delete restrict,
  "Level" text not null,
  "AnswerID" uuid references public."Answer" ("AnswerID") on delete set null,
  "Answer" text,
  "Status" text not null check ("Status" in ('viewed', 'answered', 'changed_answer', 'skipped', 'paused', 'submitted', 'correct', 'incorrect')),
  "Image" text,
  "Explanation" text,
  "TimeStamp" timestamptz not null default now(),
  "Duration" integer not null default 0 check ("Duration" >= 0),
  "EventType" text not null default 'enter' check ("EventType" in ('enter', 'heartbeat', 'answer', 'pause', 'skip', 'submit', 'hint')),
  "SelectedChoice" smallint check ("SelectedChoice" between 0 and 3),
  unique ("UserID", "ClientNonce", "QuestionID")
);

create table public."Hint" (
  "HintID" uuid primary key default gen_random_uuid(),
  "HintType" text not null,
  "Point" numeric(4, 2) not null default 0.50 check ("Point" >= 0),
  "TestID" uuid not null references public."Test" ("TestID") on delete cascade,
  "LogID" uuid not null references public."Log" ("LogID") on delete cascade,
  "UserID" uuid not null references auth.users (id) on delete cascade,
  "ClientNonce" uuid not null,
  "QuestionID" uuid not null references public."Question" ("QuestionID") on delete cascade,
  "EliminatedAnswerIDs" jsonb not null default '[]'::jsonb,
  "EliminatedChoices" jsonb not null default '[]'::jsonb,
  "TimeStamp" timestamptz not null default now(),
  unique ("UserID", "ClientNonce", "LogID")
);

alter table public."Subject" enable row level security;
alter table public."Category" enable row level security;
alter table public."Test" enable row level security;
alter table public."Question" enable row level security;
alter table public."Answer" enable row level security;
alter table public."Log" enable row level security;
alter table public."Hint" enable row level security;

create index "Category_SubjectID_idx" on public."Category" ("SubjectID");
create index "Question_TestID_idx" on public."Question" ("TestID");
create index "Question_SubjectID_idx" on public."Question" ("SubjectID");
create index "Question_CategoryID_idx" on public."Question" ("CategoryID");
create index "Answer_QuestionID_idx" on public."Answer" ("QuestionID");
create index "Log_UserID_TestID_idx" on public."Log" ("UserID", "TestID", "ClientNonce");
create index "Log_TestID_fk_idx" on public."Log" ("TestID");
create index "Log_SubjectID_fk_idx" on public."Log" ("SubjectID");
create index "Log_CategoryID_fk_idx" on public."Log" ("CategoryID");
create index "Log_QuestionID_idx" on public."Log" ("QuestionID");
create index "Log_AnswerID_idx" on public."Log" ("AnswerID");
create index "Hint_UserID_TestID_idx" on public."Hint" ("UserID", "TestID", "ClientNonce");
create index "Hint_TestID_fk_idx" on public."Hint" ("TestID");
create index "Hint_QuestionID_fk_idx" on public."Hint" ("QuestionID");
create index "Hint_LogID_idx" on public."Hint" ("LogID");

revoke all on table public."Subject" from anon, authenticated;
revoke all on table public."Category" from anon, authenticated;
revoke all on table public."Test" from anon, authenticated;
revoke all on table public."Question" from anon, authenticated;
revoke all on table public."Answer" from anon, authenticated;
revoke all on table public."Log" from anon, authenticated;
revoke all on table public."Hint" from anon, authenticated;

grant select, insert, update, delete on table public."Subject" to service_role;
grant select, insert, update, delete on table public."Category" to service_role;
grant select, insert, update, delete on table public."Test" to service_role;
grant select, insert, update, delete on table public."Question" to service_role;
grant select, insert, update, delete on table public."Answer" to service_role;
grant select, insert, update, delete on table public."Log" to service_role;
grant select, insert, update, delete on table public."Hint" to service_role;

insert into public."Subject" ("SubjectID", "Subject") values
  ('30000000-0000-4000-8000-000000000001', 'คณิตศาสตร์');

insert into public."Category" ("CategoryID", "Category", "SubjectID") values
  ('40000000-0000-4000-8000-000000000001', 'พีชคณิต', '30000000-0000-4000-8000-000000000001');

insert into public."Test" ("TestID", "Question", "Subject", "Category", "Level", "Duration") values
  ('10000000-0000-4000-8000-000000000001', 'คณิตศาสตร์ · ชุดฝึกจับเวลา 05', 'คณิตศาสตร์', 'พีชคณิต', 'ระดับพื้นฐาน', 1800);

insert into public."Question" ("QuestionID", "TestID", "Question", "SubjectID", "CategoryID", "Level") values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ถ้า 3x + 7 = 22 แล้ว x มีค่าเท่าใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'จำนวนใดเป็นจำนวนเฉพาะ?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'พื้นที่ของสี่เหลี่ยมจัตุรัสด้านยาว 8 ซม. เท่ากับเท่าใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '3/4 เขียนเป็นทศนิยมได้ข้อใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'ค่าเฉลี่ยของ 6, 8 และ 10 เท่ากับเท่าใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'มุมตรงมีขนาดกี่องศา?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '2⁵ มีค่าเท่าใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'จำนวนถัดไปของ 2, 4, 8, 16 คือข้อใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'รากที่สองของ 144 คือข้อใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน'),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', '15% ของ 200 เท่ากับเท่าใด?', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ระดับพื้นฐาน');

insert into public."Answer" ("QuestionID", "ChoiceIndex", "Answer", "Status", "Explanation") values
  ('20000000-0000-4000-8000-000000000001', 0, '3', 'incorrect', 'ย้าย 7 ไปอีกข้างจะได้ 3x = 15'),
  ('20000000-0000-4000-8000-000000000001', 1, '5', 'correct', '3x + 7 = 22 ดังนั้น 3x = 15 และ x = 5'),
  ('20000000-0000-4000-8000-000000000001', 2, '7', 'incorrect', 'ค่า x = 7 จะทำให้ 3x + 7 = 28'),
  ('20000000-0000-4000-8000-000000000001', 3, '9', 'incorrect', 'ค่า x = 9 จะทำให้ 3x + 7 = 34'),
  ('20000000-0000-4000-8000-000000000002', 0, '21', 'incorrect', '21 หารด้วย 3 และ 7 ได้'),
  ('20000000-0000-4000-8000-000000000002', 1, '27', 'incorrect', '27 หารด้วย 3 ได้'),
  ('20000000-0000-4000-8000-000000000002', 2, '29', 'correct', '29 มีตัวประกอบเพียง 1 และ 29'),
  ('20000000-0000-4000-8000-000000000002', 3, '33', 'incorrect', '33 หารด้วย 3 และ 11 ได้'),
  ('20000000-0000-4000-8000-000000000003', 0, '16 ตร.ซม.', 'incorrect', 'พื้นที่สี่เหลี่ยมจัตุรัสคือ ด้าน × ด้าน'),
  ('20000000-0000-4000-8000-000000000003', 1, '32 ตร.ซม.', 'incorrect', '32 คือ 8 × 4 ไม่ใช่พื้นที่สี่เหลี่ยมจัตุรัส'),
  ('20000000-0000-4000-8000-000000000003', 2, '64 ตร.ซม.', 'correct', 'พื้นที่ = 8 × 8 = 64 ตารางเซนติเมตร'),
  ('20000000-0000-4000-8000-000000000003', 3, '80 ตร.ซม.', 'incorrect', '80 ไม่ใช่ผลคูณของ 8 × 8'),
  ('20000000-0000-4000-8000-000000000004', 0, '0.25', 'incorrect', '0.25 เท่ากับ 1/4'),
  ('20000000-0000-4000-8000-000000000004', 1, '0.50', 'incorrect', '0.50 เท่ากับ 1/2'),
  ('20000000-0000-4000-8000-000000000004', 2, '0.75', 'correct', '3 หาร 4 ได้ 0.75'),
  ('20000000-0000-4000-8000-000000000004', 3, '1.25', 'incorrect', '1.25 มากกว่า 1 แต่ 3/4 น้อยกว่า 1'),
  ('20000000-0000-4000-8000-000000000005', 0, '7', 'incorrect', 'ค่าเฉลี่ยคือผลรวม หารด้วยจำนวนข้อมูล'),
  ('20000000-0000-4000-8000-000000000005', 1, '8', 'correct', '(6 + 8 + 10) ÷ 3 = 8'),
  ('20000000-0000-4000-8000-000000000005', 2, '9', 'incorrect', 'ผลรวม 24 หาร 3 ได้ 8'),
  ('20000000-0000-4000-8000-000000000005', 3, '10', 'incorrect', '10 เป็นค่ามากสุด ไม่ใช่ค่าเฉลี่ย'),
  ('20000000-0000-4000-8000-000000000006', 0, '45°', 'incorrect', '45° เป็นมุมแหลม'),
  ('20000000-0000-4000-8000-000000000006', 1, '90°', 'incorrect', '90° เป็นมุมฉาก'),
  ('20000000-0000-4000-8000-000000000006', 2, '180°', 'correct', 'มุมตรงมีขนาด 180 องศา'),
  ('20000000-0000-4000-8000-000000000006', 3, '360°', 'incorrect', '360° คือมุมรอบจุด'),
  ('20000000-0000-4000-8000-000000000007', 0, '10', 'incorrect', '2⁵ คือ 2 คูณกัน 5 ตัว'),
  ('20000000-0000-4000-8000-000000000007', 1, '16', 'incorrect', '16 คือ 2⁴'),
  ('20000000-0000-4000-8000-000000000007', 2, '25', 'incorrect', '25 คือ 5²'),
  ('20000000-0000-4000-8000-000000000007', 3, '32', 'correct', '2 × 2 × 2 × 2 × 2 = 32'),
  ('20000000-0000-4000-8000-000000000008', 0, '18', 'incorrect', 'ลำดับนี้คูณ 2 ทุกครั้ง'),
  ('20000000-0000-4000-8000-000000000008', 1, '24', 'incorrect', '24 ไม่ได้เกิดจาก 16 × 2'),
  ('20000000-0000-4000-8000-000000000008', 2, '30', 'incorrect', '30 ไม่ใช่ค่าถัดไปของลำดับคูณ 2'),
  ('20000000-0000-4000-8000-000000000008', 3, '32', 'correct', '2, 4, 8, 16, 32'),
  ('20000000-0000-4000-8000-000000000009', 0, '10', 'incorrect', '10² = 100'),
  ('20000000-0000-4000-8000-000000000009', 1, '11', 'incorrect', '11² = 121'),
  ('20000000-0000-4000-8000-000000000009', 2, '12', 'correct', '12² = 144'),
  ('20000000-0000-4000-8000-000000000009', 3, '14', 'incorrect', '14² = 196'),
  ('20000000-0000-4000-8000-000000000010', 0, '15', 'incorrect', '15% ของ 200 คือ 0.15 × 200'),
  ('20000000-0000-4000-8000-000000000010', 1, '20', 'incorrect', '20 คือ 10% ของ 200'),
  ('20000000-0000-4000-8000-000000000010', 2, '30', 'correct', '0.15 × 200 = 30'),
  ('20000000-0000-4000-8000-000000000010', 3, '45', 'incorrect', '45 มากกว่าค่าที่ถูกต้อง');

create or replace function public.log_question_activity_service(
  p_user_id uuid,
  p_set_id uuid,
  p_client_nonce uuid,
  p_question_id uuid,
  p_event_type text,
  p_duration_seconds integer,
  p_selected_choice integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question record;
  v_answer_id uuid;
  v_answer_text text;
  v_answer_image text;
  v_answer_explanation text;
  v_log_id uuid;
  v_duration integer;
begin
  if p_duration_seconds is null or p_duration_seconds < 0 then
    raise exception 'INVALID_DURATION';
  end if;

  if p_event_type not in ('enter', 'heartbeat', 'answer', 'pause', 'skip', 'submit', 'hint') then
    raise exception 'INVALID_EVENT_TYPE';
  end if;

  if p_status not in ('viewed', 'answered', 'changed_answer', 'skipped', 'paused', 'submitted', 'correct', 'incorrect') then
    raise exception 'INVALID_STATUS';
  end if;

  if p_selected_choice is not null and (p_selected_choice < 0 or p_selected_choice > 3) then
    raise exception 'INVALID_CHOICE';
  end if;

  select q."QuestionID", q."Question", q."SubjectID", q."CategoryID", q."Level"
    into v_question
  from public."Question" q
  where q."QuestionID" = p_question_id
    and q."TestID" = p_set_id;

  if not found then
    raise exception 'QUESTION_NOT_AVAILABLE';
  end if;

  if p_selected_choice is not null then
    select a."AnswerID", a."Answer", a."Image", a."Explanation"
      into v_answer_id, v_answer_text, v_answer_image, v_answer_explanation
    from public."Answer" a
    where a."QuestionID" = p_question_id
      and a."ChoiceIndex" = p_selected_choice;

    if not found then
      raise exception 'ANSWER_NOT_AVAILABLE';
    end if;
  end if;

  insert into public."Log" (
    "UserID", "ClientNonce", "TestID", "QuestionID", "Question",
    "SubjectID", "CategoryID", "Level", "AnswerID", "Answer",
    "Status", "Image", "Explanation", "Duration", "EventType", "SelectedChoice"
  )
  values (
    p_user_id, p_client_nonce, p_set_id, p_question_id, v_question."Question",
    v_question."SubjectID", v_question."CategoryID", v_question."Level",
    v_answer_id, v_answer_text, p_status,
    v_answer_image, v_answer_explanation,
    p_duration_seconds, p_event_type, p_selected_choice
  )
  on conflict ("UserID", "ClientNonce", "QuestionID")
  do update set
    "AnswerID" = coalesce(excluded."AnswerID", public."Log"."AnswerID"),
    "Answer" = coalesce(excluded."Answer", public."Log"."Answer"),
    "Status" = excluded."Status",
    "Image" = coalesce(excluded."Image", public."Log"."Image"),
    "Explanation" = coalesce(excluded."Explanation", public."Log"."Explanation"),
    "TimeStamp" = now(),
    "Duration" = greatest(public."Log"."Duration", excluded."Duration"),
    "EventType" = excluded."EventType",
    "SelectedChoice" = excluded."SelectedChoice"
  returning "LogID", "Duration" into v_log_id, v_duration;

  return jsonb_build_object(
    'log_id', v_log_id,
    'duration_seconds', v_duration,
    'view_count', 1,
    'status', p_status
  );
end;
$$;

create or replace function public.use_hint_service(
  p_user_id uuid,
  p_set_id uuid,
  p_client_nonce uuid,
  p_question_id uuid,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id uuid;
  v_existing record;
  v_hints_used integer;
  v_eliminated_choices jsonb;
  v_eliminated_answer_ids jsonb;
  v_hint_id uuid;
begin
  perform public.log_question_activity_service(
    p_user_id,
    p_set_id,
    p_client_nonce,
    p_question_id,
    'hint',
    p_duration_seconds,
    null,
    'viewed'
  );

  select l."LogID" into v_log_id
  from public."Log" l
  where l."UserID" = p_user_id
    and l."ClientNonce" = p_client_nonce
    and l."QuestionID" = p_question_id;

  select h."HintID", h."EliminatedChoices", h."Point"
    into v_existing
  from public."Hint" h
  where h."UserID" = p_user_id
    and h."ClientNonce" = p_client_nonce
    and h."LogID" = v_log_id;

  if found then
    select count(*) into v_hints_used
    from public."Hint" h
    where h."UserID" = p_user_id
      and h."TestID" = p_set_id
      and h."ClientNonce" = p_client_nonce;

    return jsonb_build_object(
      'hint_id', v_existing."HintID",
      'hint_text', 'ระบบตัดตัวเลือกที่ผิดออกให้ 2 ข้อแล้ว',
      'hint_type', 'eliminate_wrong_choices',
      'eliminated_choices', v_existing."EliminatedChoices",
      'point_penalty', v_existing."Point",
      'hints_used', v_hints_used,
      'hints_remaining', greatest(0, 2 - v_hints_used),
      'total_penalty', v_hints_used * 0.5
    );
  end if;

  select count(*) into v_hints_used
  from public."Hint" h
  where h."UserID" = p_user_id
    and h."TestID" = p_set_id
    and h."ClientNonce" = p_client_nonce;

  if v_hints_used >= 2 then
    raise exception 'HINT_LIMIT_REACHED';
  end if;

  select coalesce(jsonb_agg(x."ChoiceIndex" order by x."ChoiceIndex"), '[]'::jsonb),
         coalesce(jsonb_agg(x."AnswerID" order by x."ChoiceIndex"), '[]'::jsonb)
    into v_eliminated_choices, v_eliminated_answer_ids
  from (
    select a."ChoiceIndex", a."AnswerID"
    from public."Answer" a
    where a."QuestionID" = p_question_id
      and a."Status" = 'incorrect'
    order by a."ChoiceIndex"
    limit 2
  ) x;

  if jsonb_array_length(v_eliminated_choices) < 2 then
    raise exception 'HINT_NOT_AVAILABLE';
  end if;

  insert into public."Hint" (
    "HintType", "Point", "TestID", "LogID", "UserID",
    "ClientNonce", "QuestionID", "EliminatedAnswerIDs", "EliminatedChoices"
  )
  values (
    'eliminate_wrong_choices',
    0.50,
    p_set_id,
    v_log_id,
    p_user_id,
    p_client_nonce,
    p_question_id,
    v_eliminated_answer_ids,
    v_eliminated_choices
  )
  returning "HintID" into v_hint_id;

  v_hints_used := v_hints_used + 1;

  return jsonb_build_object(
    'hint_id', v_hint_id,
    'hint_text', 'ระบบตัดตัวเลือกที่ผิดออกให้ 2 ข้อแล้ว',
    'hint_type', 'eliminate_wrong_choices',
    'eliminated_choices', v_eliminated_choices,
    'point_penalty', 0.5,
    'hints_used', v_hints_used,
    'hints_remaining', greatest(0, 2 - v_hints_used),
    'total_penalty', v_hints_used * 0.5
  );
end;
$$;

create or replace function public.submit_attempt_service(
  p_user_id uuid,
  p_set_id uuid,
  p_answers jsonb,
  p_elapsed_seconds integer,
  p_client_nonce uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_answered integer := 0;
  v_correct integer := 0;
  v_hint_count integer := 0;
  v_penalty numeric := 0;
  v_score numeric := 0;
  v_accuracy numeric := 0;
  v_ranking_points bigint := 0;
  v_item record;
  v_answer record;
begin
  if p_elapsed_seconds is null or p_elapsed_seconds < 0 then
    raise exception 'INVALID_DURATION';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'INVALID_ANSWERS';
  end if;

  select count(*) into v_total
  from public."Question" q
  where q."TestID" = p_set_id;

  if v_total = 0 then
    raise exception 'SET_NOT_AVAILABLE';
  end if;

  for v_item in
    select key::uuid as question_id, value::integer as choice_index
    from jsonb_each_text(p_answers)
  loop
    if v_item.choice_index < 0 or v_item.choice_index > 3 then
      raise exception 'INVALID_CHOICE';
    end if;

    select a."AnswerID", a."Answer", a."Status", a."Image", a."Explanation"
      into v_answer
    from public."Question" q
    join public."Answer" a on a."QuestionID" = q."QuestionID"
    where q."QuestionID" = v_item.question_id
      and q."TestID" = p_set_id
      and a."ChoiceIndex" = v_item.choice_index;

    if found then
      v_answered := v_answered + 1;
      if v_answer."Status" = 'correct' then
        v_correct := v_correct + 1;
      end if;

      perform public.log_question_activity_service(
        p_user_id,
        p_set_id,
        p_client_nonce,
        v_item.question_id,
        'submit',
        0,
        v_item.choice_index,
        v_answer."Status"
      );
    end if;
  end loop;

  select count(*) into v_hint_count
  from public."Hint" h
  where h."UserID" = p_user_id
    and h."TestID" = p_set_id
    and h."ClientNonce" = p_client_nonce;

  v_penalty := v_hint_count * 0.5;
  v_score := greatest(v_correct - v_penalty, 0);
  v_accuracy := case when v_total = 0 then 0 else round((v_correct::numeric / v_total::numeric) * 100, 2) end;
  v_ranking_points := greatest(0, round((v_score * 100) + greatest(0, 1800 - p_elapsed_seconds) / 10.0));

  return jsonb_build_object(
    'attempt_id', p_client_nonce,
    'correct_count', v_correct,
    'total_questions', v_total,
    'accuracy', v_accuracy,
    'score', v_score,
    'hint_count', v_hint_count,
    'hint_penalty', v_penalty,
    'ranking_points', v_ranking_points,
    'ranked', true,
    'duplicate', false,
    'answered_count', v_answered
  );
end;
$$;

create or replace function public.get_leaderboard(p_limit integer default 20)
returns table (
  rank_position integer,
  public_id uuid,
  display_name text,
  ranking_points bigint,
  attempts_count integer,
  accuracy_avg numeric,
  active_seconds bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    null::integer as rank_position,
    null::uuid as public_id,
    null::text as display_name,
    null::bigint as ranking_points,
    null::integer as attempts_count,
    null::numeric as accuracy_avg,
    null::bigint as active_seconds,
    null::timestamptz as updated_at
  where false
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_leaderboard(integer) from public, anon, authenticated;

grant execute on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, integer, text) to service_role;
grant execute on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.submit_attempt_service(uuid, uuid, jsonb, integer, uuid) to service_role;
grant execute on function public.get_leaderboard(integer) to service_role;
