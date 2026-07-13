-- Question-level activity logs and hint penalties for SkillQuest attempts.
-- Logs are kept separate from attempts so the dashboard can analyze strengths,
-- weak spots, per-question time, pauses, skips, and hint usage later.

alter table public.attempts add column if not exists score numeric(6,2);
alter table public.attempts add column if not exists hint_count smallint not null default 0 check (hint_count between 0 and 2);
alter table public.attempts add column if not exists hint_penalty numeric(5,2) not null default 0 check (hint_penalty between 0 and 1);

update public.attempts
set score = correct_count
where score is null;

alter table public.attempts alter column score set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attempts_score_valid' and conrelid = 'public.attempts'::regclass
  ) then
    alter table public.attempts
      add constraint attempts_score_valid check (score >= 0 and score <= total_questions);
  end if;
end;
$$;

create table if not exists public.question_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.question_sets(id) on delete cascade,
  client_nonce uuid not null,
  attempt_id uuid references public.attempts(id) on delete set null,
  question_id uuid not null references public.questions(id) on delete cascade,
  question_position smallint not null,
  question text not null,
  subject text not null,
  category text,
  level text not null default 'ระดับพื้นฐาน',
  selected_choice smallint check (selected_choice between 0 and 5),
  selected_answer text,
  answer_status text not null default 'viewed' check (answer_status in ('viewed', 'answered', 'changed_answer', 'skipped', 'paused', 'submitted')),
  is_correct boolean,
  correct_choice smallint check (correct_choice between 0 and 5),
  explanation text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 14400),
  view_count integer not null default 1 check (view_count > 0),
  last_event_type text not null default 'enter' check (last_event_type in ('enter', 'heartbeat', 'answer', 'pause', 'skip', 'submit', 'hint')),
  constraint question_logs_user_nonce_question_unique unique (user_id, client_nonce, question_id)
);

create index if not exists question_logs_user_test_idx on public.question_logs (user_id, test_id, client_nonce);
create index if not exists question_logs_attempt_idx on public.question_logs (attempt_id);
create index if not exists question_logs_question_idx on public.question_logs (question_id);

alter table public.question_logs enable row level security;
revoke all on public.question_logs from public, anon, authenticated;
grant select, insert, update on public.question_logs to service_role;

create table if not exists private.question_hints (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position smallint not null check (position between 1 and 2),
  hint_type text not null default 'concept',
  hint_text text not null check (char_length(hint_text) between 1 and 600),
  point_penalty numeric(3,2) not null default 0.5 check (point_penalty = 0.5),
  created_at timestamptz not null default now(),
  constraint question_hints_question_position_unique unique (question_id, position)
);

alter table private.question_hints enable row level security;
revoke all on private.question_hints from public, anon, authenticated;
grant select on private.question_hints to service_role;

create table if not exists public.hint_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.question_sets(id) on delete cascade,
  client_nonce uuid not null,
  attempt_id uuid references public.attempts(id) on delete set null,
  log_id uuid references public.question_logs(id) on delete set null,
  question_id uuid not null references public.questions(id) on delete cascade,
  hint_type text not null,
  hint_text text not null,
  point_penalty numeric(3,2) not null default 0.5 check (point_penalty = 0.5),
  used_at timestamptz not null default now()
);

create index if not exists hint_logs_user_test_idx on public.hint_logs (user_id, test_id, client_nonce);
create index if not exists hint_logs_attempt_idx on public.hint_logs (attempt_id);
create index if not exists hint_logs_log_idx on public.hint_logs (log_id);

alter table public.hint_logs enable row level security;
revoke all on public.hint_logs from public, anon, authenticated;
grant select, insert, update on public.hint_logs to service_role;

create or replace function public.log_question_activity_service(
  p_user_id uuid,
  p_set_id uuid,
  p_client_nonce uuid,
  p_question_id uuid,
  p_event_type text,
  p_duration_seconds integer,
  p_selected_choice smallint,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.question_logs%rowtype;
  v_question public.questions%rowtype;
  v_set public.question_sets%rowtype;
  v_answer_text text;
  v_event text := coalesce(p_event_type, 'heartbeat');
  v_status text := coalesce(p_status, 'viewed');
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'INVALID_USER' using errcode = '42501';
  end if;

  if p_client_nonce is null or p_duration_seconds is null or p_duration_seconds not between 0 and 14400 then
    raise exception 'INVALID_LOG';
  end if;

  if v_event not in ('enter', 'heartbeat', 'answer', 'pause', 'skip', 'submit', 'hint') then
    raise exception 'INVALID_LOG';
  end if;

  if v_status not in ('viewed', 'answered', 'changed_answer', 'skipped', 'paused', 'submitted') then
    raise exception 'INVALID_LOG';
  end if;

  if p_selected_choice is not null and p_selected_choice not between 0 and 5 then
    raise exception 'INVALID_LOG';
  end if;

  select * into v_set from public.question_sets where id = p_set_id and is_active = true;
  if not found then raise exception 'SET_NOT_AVAILABLE'; end if;

  select * into v_question from public.questions where id = p_question_id and set_id = p_set_id;
  if not found then raise exception 'QUESTION_NOT_AVAILABLE'; end if;

  if p_selected_choice is not null then
    v_answer_text := v_question.choices ->> p_selected_choice;
  end if;

  insert into public.question_logs (
    user_id, test_id, client_nonce, question_id, question_position, question,
    subject, selected_choice, selected_answer, answer_status, duration_seconds,
    last_event_type, view_count
  ) values (
    p_user_id, p_set_id, p_client_nonce, p_question_id, v_question.position, v_question.prompt,
    v_set.subject, p_selected_choice, v_answer_text, v_status, p_duration_seconds,
    v_event, case when v_event = 'enter' then 1 else 1 end
  )
  on conflict (user_id, client_nonce, question_id) do update set
    duration_seconds = greatest(public.question_logs.duration_seconds, excluded.duration_seconds),
    selected_choice = coalesce(excluded.selected_choice, public.question_logs.selected_choice),
    selected_answer = coalesce(excluded.selected_answer, public.question_logs.selected_answer),
    answer_status = excluded.answer_status,
    last_event_type = excluded.last_event_type,
    view_count = public.question_logs.view_count + case when v_event = 'enter' then 1 else 0 end,
    last_seen_at = now(),
    updated_at = now()
  returning * into v_log;

  return jsonb_build_object(
    'log_id', v_log.id,
    'duration_seconds', v_log.duration_seconds,
    'view_count', v_log.view_count,
    'status', v_log.answer_status
  );
end;
$$;

revoke all on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, smallint, text) from public, anon, authenticated;
grant execute on function public.log_question_activity_service(uuid, uuid, uuid, uuid, text, integer, smallint, text) to service_role;

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
  v_used integer;
  v_log_id uuid;
  v_hint private.question_hints%rowtype;
  v_fallback text;
  v_hint_log public.hint_logs%rowtype;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'INVALID_USER' using errcode = '42501';
  end if;

  if p_client_nonce is null then
    raise exception 'INVALID_HINT';
  end if;

  select count(*) into v_used
  from public.hint_logs
  where user_id = p_user_id and test_id = p_set_id and client_nonce = p_client_nonce;

  if v_used >= 2 then
    raise exception 'HINT_LIMIT_REACHED';
  end if;

  select (public.log_question_activity_service(
    p_user_id, p_set_id, p_client_nonce, p_question_id, 'hint',
    greatest(coalesce(p_duration_seconds, 0), 0), null, 'viewed'
  ) ->> 'log_id')::uuid into v_log_id;

  select * into v_hint
  from private.question_hints
  where question_id = p_question_id
  order by position asc
  offset least(v_used, 1)
  limit 1;

  if not found then
    v_fallback := 'ลองแยกข้อมูลสำคัญจากโจทย์ แล้วตัดตัวเลือกที่ขัดกับเงื่อนไขออกก่อน';
  end if;

  insert into public.hint_logs (
    user_id, test_id, client_nonce, log_id, question_id,
    hint_type, hint_text, point_penalty
  ) values (
    p_user_id, p_set_id, p_client_nonce, v_log_id, p_question_id,
    coalesce(v_hint.hint_type, 'concept'), coalesce(v_hint.hint_text, v_fallback), 0.5
  )
  returning * into v_hint_log;

  return jsonb_build_object(
    'hint_id', v_hint_log.id,
    'hint_text', v_hint_log.hint_text,
    'hint_type', v_hint_log.hint_type,
    'point_penalty', v_hint_log.point_penalty,
    'hints_used', v_used + 1,
    'hints_remaining', greatest(0, 2 - (v_used + 1)),
    'total_penalty', (v_used + 1) * 0.5
  );
end;
$$;

revoke all on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.use_hint_service(uuid, uuid, uuid, uuid, integer) to service_role;

create or replace function public.submit_attempt(
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
  v_user_id uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_total integer;
  v_answered integer;
  v_correct integer;
  v_accuracy numeric(5,2);
  v_ranked boolean;
  v_points integer;
  v_answer_count integer;
  v_hint_count integer;
  v_hint_penalty numeric(5,2);
  v_score numeric(6,2);
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_nonce is null or p_elapsed_seconds not between 30 and 14400 then
    raise exception 'INVALID_ATTEMPT';
  end if;

  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'INVALID_ANSWERS';
  end if;

  select count(*) into v_answer_count from jsonb_object_keys(p_answers);
  if v_answer_count > 200 then
    raise exception 'INVALID_ANSWERS';
  end if;

  select * into v_attempt
  from public.attempts
  where user_id = v_user_id and client_nonce = p_client_nonce;

  if found then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'correct_count', v_attempt.correct_count,
      'total_questions', v_attempt.total_questions,
      'accuracy', v_attempt.accuracy,
      'score', v_attempt.score,
      'hint_count', v_attempt.hint_count,
      'hint_penalty', v_attempt.hint_penalty,
      'ranking_points', v_attempt.ranking_points,
      'ranked', v_attempt.ranked,
      'duplicate', true
    );
  end if;

  if not exists (select 1 from public.question_sets where id = p_set_id and is_active = true) then
    raise exception 'SET_NOT_AVAILABLE';
  end if;

  if exists (select 1 from jsonb_each_text(p_answers) a where a.value !~ '^[0-5]$') then
    raise exception 'INVALID_ANSWERS';
  end if;

  if (select count(*) from public.attempts where user_id = v_user_id and submitted_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || p_set_id::text || current_date::text, 0));

  select count(*) into v_total from public.questions where set_id = p_set_id;
  if v_total = 0 then raise exception 'EMPTY_SET'; end if;

  select count(*) into v_answered
  from public.questions q
  where q.set_id = p_set_id and p_answers ? q.id::text;

  select count(*) into v_correct
  from public.questions q
  join private.question_keys k on k.question_id = q.id
  where q.set_id = p_set_id
    and p_answers ? q.id::text
    and (p_answers ->> q.id::text)::smallint = k.correct_choice;

  select count(*) into v_hint_count
  from public.hint_logs
  where user_id = v_user_id and test_id = p_set_id and client_nonce = p_client_nonce;

  v_hint_count := least(coalesce(v_hint_count, 0), 2);
  v_hint_penalty := v_hint_count * 0.5;
  v_score := greatest(0, v_correct::numeric - v_hint_penalty);
  v_accuracy := round((v_correct::numeric * 100) / v_total, 2);
  v_ranked := not exists (
    select 1 from public.attempts
    where user_id = v_user_id and set_id = p_set_id and ranked
      and submitted_at >= current_date::timestamptz
      and submitted_at < (current_date + 1)::timestamptz
  );
  v_points := case when v_ranked then greatest(0, floor(v_score * 100)::integer + greatest(0, 300 - (p_elapsed_seconds / 10))) else 0 end;

  insert into public.attempts (
    user_id, set_id, client_nonce, elapsed_seconds, answered_count,
    correct_count, total_questions, accuracy, score, hint_count,
    hint_penalty, ranking_points, ranked
  ) values (
    v_user_id, p_set_id, p_client_nonce, p_elapsed_seconds, v_answered,
    v_correct, v_total, v_accuracy, v_score, v_hint_count,
    v_hint_penalty, v_points, v_ranked
  ) returning * into v_attempt;

  update public.question_logs l
  set
    attempt_id = v_attempt.id,
    answer_status = 'submitted',
    selected_choice = coalesce((p_answers ->> l.question_id::text)::smallint, l.selected_choice),
    selected_answer = coalesce(q.choices ->> ((p_answers ->> l.question_id::text)::int), l.selected_answer),
    is_correct = case
      when p_answers ? l.question_id::text then ((p_answers ->> l.question_id::text)::smallint = k.correct_choice)
      else false
    end,
    correct_choice = k.correct_choice,
    updated_at = now()
  from public.questions q
  left join private.question_keys k on k.question_id = q.id
  where l.user_id = v_user_id
    and l.test_id = p_set_id
    and l.client_nonce = p_client_nonce
    and q.id = l.question_id;

  update public.hint_logs
  set attempt_id = v_attempt.id
  where user_id = v_user_id and test_id = p_set_id and client_nonce = p_client_nonce;

  insert into private.leaderboard_entries (
    user_id, display_name, ranking_points, attempts_count, accuracy_avg, active_seconds, updated_at
  )
  select
    v_user_id,
    coalesce((select display_name from public.profiles where user_id = v_user_id), 'ผู้เตรียมสอบ'),
    coalesce(sum(a.ranking_points), 0),
    count(*)::integer,
    round(avg(a.accuracy), 2),
    coalesce(sum(a.elapsed_seconds), 0),
    now()
  from public.attempts a
  where a.user_id = v_user_id
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    ranking_points = excluded.ranking_points,
    attempts_count = excluded.attempts_count,
    accuracy_avg = excluded.accuracy_avg,
    active_seconds = excluded.active_seconds,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'correct_count', v_attempt.correct_count,
    'total_questions', v_attempt.total_questions,
    'accuracy', v_attempt.accuracy,
    'score', v_attempt.score,
    'hint_count', v_attempt.hint_count,
    'hint_penalty', v_attempt.hint_penalty,
    'ranking_points', v_attempt.ranking_points,
    'ranked', v_attempt.ranked,
    'duplicate', false
  );
end;
$$;

revoke all on function public.submit_attempt(uuid, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.submit_attempt(uuid, jsonb, integer, uuid) to service_role;

insert into private.question_hints (question_id, position, hint_type, hint_text) values
('20000000-0000-4000-8000-000000000001', 1, 'concept', 'ย้ายค่าคงที่ไปอีกฝั่งก่อน แล้วหารด้วยสัมประสิทธิ์ของ x'),
('20000000-0000-4000-8000-000000000001', 2, 'eliminate', 'ลองแทนค่าตัวเลือกกลับเข้าไปในสมการ 3x + 7'),
('20000000-0000-4000-8000-000000000002', 1, 'concept', 'จำนวนเฉพาะมีตัวประกอบบวกเพียง 1 และตัวมันเอง'),
('20000000-0000-4000-8000-000000000002', 2, 'eliminate', 'ตัดจำนวนที่หารด้วย 3 ลงตัวออกก่อน'),
('20000000-0000-4000-8000-000000000003', 1, 'formula', 'พื้นที่สี่เหลี่ยมจัตุรัสเท่ากับ ด้าน × ด้าน'),
('20000000-0000-4000-8000-000000000003', 2, 'eliminate', 'ด้านยาว 8 จึงไม่ใช่การบวก 8 + 8'),
('20000000-0000-4000-8000-000000000004', 1, 'concept', 'เศษส่วน 3/4 คือ 3 หาร 4'),
('20000000-0000-4000-8000-000000000004', 2, 'eliminate', 'หนึ่งในสี่คือ 0.25 ดังนั้นสามในสี่มากกว่านั้นสามเท่า'),
('20000000-0000-4000-8000-000000000005', 1, 'formula', 'ค่าเฉลี่ยคือผลรวมของข้อมูล หารด้วยจำนวนข้อมูล'),
('20000000-0000-4000-8000-000000000005', 2, 'concept', 'ชุด 6, 8, 10 มีระยะห่างเท่ากัน ค่าเฉลี่ยอยู่ตรงกลาง'),
('20000000-0000-4000-8000-000000000006', 1, 'concept', 'มุมตรงคือเส้นตรงหนึ่งเส้น'),
('20000000-0000-4000-8000-000000000006', 2, 'eliminate', 'มุมฉากคือ 90 องศา แต่มุมตรงเป็นสองเท่าของมุมฉาก'),
('20000000-0000-4000-8000-000000000007', 1, 'concept', '2⁵ หมายถึงนำ 2 มาคูณกัน 5 ตัว'),
('20000000-0000-4000-8000-000000000007', 2, 'eliminate', 'คำนวณต่อจาก 2⁴ = 16 อีกหนึ่งเท่าตัว'),
('20000000-0000-4000-8000-000000000008', 1, 'pattern', 'ลำดับนี้คูณ 2 ทุกครั้ง'),
('20000000-0000-4000-8000-000000000008', 2, 'eliminate', 'หลัง 16 ให้เพิ่มแบบเท่าตัว ไม่ใช่เพิ่มค่าคงที่'),
('20000000-0000-4000-8000-000000000009', 1, 'concept', 'รากที่สองคือจำนวนที่คูณตัวเองแล้วได้ 144'),
('20000000-0000-4000-8000-000000000009', 2, 'eliminate', 'ลองคิดจาก 12 × 12'),
('20000000-0000-4000-8000-000000000010', 1, 'concept', '15% เท่ากับ 15 ต่อ 100'),
('20000000-0000-4000-8000-000000000010', 2, 'formula', 'หา 10% ของ 200 ก่อน แล้วบวก 5% ของ 200')
on conflict (question_id, position) do update set
  hint_type = excluded.hint_type,
  hint_text = excluded.hint_text;
