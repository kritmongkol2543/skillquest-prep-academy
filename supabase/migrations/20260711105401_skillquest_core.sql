-- SkillQuest core schema. Browser clients use a publishable key plus an
-- anonymous Supabase Auth session. No service-role credential is exposed.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 2 and 24),
  constraint profiles_display_name_trimmed check (display_name = btrim(display_name)),
  constraint profiles_display_name_safe check (display_name !~ '[<>]')
);

create table public.question_sets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subject text not null,
  duration_seconds integer not null default 1500 check (duration_seconds between 60 and 14400),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.question_sets(id) on delete cascade,
  position smallint not null check (position between 1 and 200),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  choices jsonb not null,
  created_at timestamptz not null default now(),
  constraint questions_set_position_unique unique (set_id, position),
  constraint questions_choices_array check (
    jsonb_typeof(choices) = 'array'
    and jsonb_array_length(choices) between 2 and 6
  )
);

create table private.question_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_choice smallint not null check (correct_choice between 0 and 5)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null references public.question_sets(id) on delete restrict,
  client_nonce uuid not null,
  elapsed_seconds integer not null check (elapsed_seconds between 1 and 14400),
  answered_count smallint not null check (answered_count >= 0),
  correct_count smallint not null check (correct_count >= 0),
  total_questions smallint not null check (total_questions > 0),
  accuracy numeric(5,2) not null check (accuracy between 0 and 100),
  ranking_points integer not null default 0 check (ranking_points >= 0),
  ranked boolean not null default false,
  submitted_at timestamptz not null default now(),
  constraint attempts_user_nonce_unique unique (user_id, client_nonce),
  constraint attempts_counts_valid check (correct_count <= answered_count and answered_count <= total_questions)
);

create table private.leaderboard_entries (
  public_id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  ranking_points bigint not null default 0,
  attempts_count integer not null default 0,
  accuracy_avg numeric(5,2) not null default 0,
  active_seconds bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index attempts_user_submitted_idx on public.attempts (user_id, submitted_at desc);
create index attempts_set_submitted_idx on public.attempts (set_id, submitted_at desc);
create index attempts_ranked_user_idx on public.attempts (user_id) where ranked;
create index leaderboard_points_idx on private.leaderboard_entries (ranking_points desc, updated_at asc);

alter table public.profiles enable row level security;
alter table public.question_sets enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table private.question_keys enable row level security;
alter table private.leaderboard_entries enable row level security;

revoke all on public.profiles, public.question_sets, public.questions, public.attempts from public, anon, authenticated;
revoke all on private.question_keys, private.leaderboard_entries from public, anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.question_sets, public.questions, public.attempts to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy question_sets_read_active on public.question_sets
  for select to authenticated
  using (is_active = true);

create policy questions_read_active_set on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.question_sets qs
    where qs.id = questions.set_id and qs.is_active = true
  ));

create policy attempts_select_own on public.attempts
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function private.sync_profile_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.leaderboard_entries (user_id, display_name)
  values (new.user_id, new.display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_profile_leaderboard() from public, anon, authenticated;

create trigger profiles_sync_leaderboard
after insert or update of display_name on public.profiles
for each row execute function private.sync_profile_leaderboard();

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
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_nonce is null or p_elapsed_seconds not between 30 and 14400 then
    raise exception 'INVALID_ATTEMPT';
  end if;

  if jsonb_typeof(p_answers) <> 'object' or jsonb_object_length(p_answers) > 200 then
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

  v_accuracy := round((v_correct::numeric * 100) / v_total, 2);
  v_ranked := not exists (
    select 1 from public.attempts
    where user_id = v_user_id and set_id = p_set_id and ranked
      and submitted_at >= current_date::timestamptz
      and submitted_at < (current_date + 1)::timestamptz
  );
  v_points := case when v_ranked then greatest(0, v_correct * 100 + greatest(0, 300 - (p_elapsed_seconds / 10))) else 0 end;

  insert into public.attempts (
    user_id, set_id, client_nonce, elapsed_seconds, answered_count,
    correct_count, total_questions, accuracy, ranking_points, ranked
  ) values (
    v_user_id, p_set_id, p_client_nonce, p_elapsed_seconds, v_answered,
    v_correct, v_total, v_accuracy, v_points, v_ranked
  ) returning * into v_attempt;

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
    'ranking_points', v_attempt.ranking_points,
    'ranked', v_attempt.ranked,
    'duplicate', false
  );
end;
$$;

revoke all on function public.submit_attempt(uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.submit_attempt(uuid, jsonb, integer, uuid) to authenticated;

create or replace function public.get_leaderboard(p_limit integer default 50)
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
    row_number() over (order by l.ranking_points desc, l.updated_at asc)::integer,
    l.public_id,
    l.display_name,
    l.ranking_points,
    l.attempts_count,
    l.accuracy_avg,
    l.active_seconds,
    l.updated_at
  from private.leaderboard_entries l
  where l.attempts_count > 0
  order by l.ranking_points desc, l.updated_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

revoke all on function public.get_leaderboard(integer) from public, anon;
grant execute on function public.get_leaderboard(integer) to authenticated;

-- Seed one versioned set. Correct answers remain inaccessible in private.
insert into public.question_sets (id, slug, title, subject, duration_seconds)
values ('10000000-0000-4000-8000-000000000001', 'math-challenge-05', 'ชุดฝึกจับเวลา 05', 'คณิตศาสตร์', 1500);

insert into public.questions (id, set_id, position, prompt, choices) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'ถ้า 3x + 7 = 22 แล้ว x มีค่าเท่าใด?','["3","5","7","9"]'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',2,'จำนวนใดเป็นจำนวนเฉพาะ?','["21","27","29","33"]'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',3,'พื้นที่ของสี่เหลี่ยมจัตุรัสด้านยาว 8 ซม. เท่ากับเท่าใด?','["16 ตร.ซม.","32 ตร.ซม.","64 ตร.ซม.","80 ตร.ซม."]'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',4,'3/4 เขียนเป็นทศนิยมได้ข้อใด?','["0.25","0.50","0.75","1.25"]'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',5,'ค่าเฉลี่ยของ 6, 8 และ 10 เท่ากับเท่าใด?','["7","8","9","10"]'),
('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001',6,'มุมตรงมีขนาดกี่องศา?','["45°","90°","180°","360°"]'),
('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',7,'2⁵ มีค่าเท่าใด?','["10","16","25","32"]'),
('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001',8,'จำนวนถัดไปของ 2, 4, 8, 16 คือข้อใด?','["18","24","30","32"]'),
('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',9,'รากที่สองของ 144 คือข้อใด?','["10","11","12","14"]'),
('20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',10,'15% ของ 200 เท่ากับเท่าใด?','["15","20","30","45"]');

insert into private.question_keys (question_id, correct_choice) values
('20000000-0000-4000-8000-000000000001',1),
('20000000-0000-4000-8000-000000000002',2),
('20000000-0000-4000-8000-000000000003',2),
('20000000-0000-4000-8000-000000000004',2),
('20000000-0000-4000-8000-000000000005',1),
('20000000-0000-4000-8000-000000000006',2),
('20000000-0000-4000-8000-000000000007',3),
('20000000-0000-4000-8000-000000000008',3),
('20000000-0000-4000-8000-000000000009',2),
('20000000-0000-4000-8000-000000000010',2);
