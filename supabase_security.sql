-- Guess It - Full migration (Auth + Score + Matchmaking + Duel)
-- Run this in Supabase SQL Editor on a fresh project.

begin;

-- ============================================================
-- Utilities
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ============================================================
-- Custom Auth (server-side cookie session, no Supabase Auth client)
-- ============================================================
create table if not exists public.app_users (
    id bigint generated always as identity primary key,
    username text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint app_users_username_format check (username ~ '^[a-z0-9_]{3,15}$')
);

create table if not exists public.app_sessions (
    id bigint generated always as identity primary key,
    user_id bigint not null references public.app_users(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists app_sessions_user_id_idx on public.app_sessions(user_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

-- ============================================================
-- Profiles
-- ============================================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,15}$')
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    candidate text;
    fallback_name text;
begin
    candidate := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
    if candidate !~ '^[a-z0-9_]{3,15}$' then
        candidate := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
    end if;

    fallback_name := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);

    begin
        insert into public.profiles (id, username)
        values (new.id, candidate)
        on conflict (id) do update
            set username = excluded.username,
                updated_at = now();
    exception when unique_violation then
        insert into public.profiles (id, username)
        values (new.id, fallback_name)
        on conflict (id) do update
            set username = excluded.username,
                updated_at = now();
    end;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- ============================================================
-- Scores (secure write via RPC only)
-- ============================================================
create table if not exists public.scores (
    id bigint generated always as identity primary key,
    user_id uuid null,
    username text not null,
    mode text not null,
    difficulty text not null,
    attempts integer not null default 1,
    points integer not null default 0,
    time_seconds integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint scores_mode_check check (mode in ('solo', 'duel')),
    constraint scores_points_nonnegative check (points >= 0),
    constraint scores_attempts_positive check (attempts > 0)
);

create unique index if not exists scores_user_mode_unique_idx on public.scores(user_id, mode);
create index if not exists scores_mode_points_idx on public.scores(mode, points desc, time_seconds asc);
create unique index if not exists scores_username_mode_unique_idx on public.scores(username, mode);

alter table public.scores alter column user_id drop not null;
alter table public.scores drop constraint if exists scores_user_id_fkey;

drop trigger if exists trg_scores_updated_at on public.scores;
create trigger trg_scores_updated_at
before update on public.scores
for each row execute function public.set_updated_at();

alter table public.scores enable row level security;

revoke all on public.scores from anon, authenticated;
grant select, insert, update, delete on public.scores to anon, authenticated;

drop policy if exists scores_public_read on public.scores;
create policy scores_public_read
on public.scores
for select
to anon, authenticated
using (true);

drop policy if exists scores_public_insert on public.scores;
create policy scores_public_insert
on public.scores
for insert
to anon, authenticated
with check (true);

drop policy if exists scores_public_update on public.scores;
create policy scores_public_update
on public.scores
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists scores_public_delete on public.scores;
create policy scores_public_delete
on public.scores
for delete
to anon, authenticated
using (true);

create or replace function public.submit_score_secure(
    p_mode text,
    p_difficulty text,
    p_attempts integer,
    p_points integer,
    p_time_seconds integer,
    p_username text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    uid uuid := auth.uid();
    safe_mode text;
    safe_difficulty text;
    safe_attempts integer;
    safe_points integer;
    safe_time integer;
    safe_username text;
begin
    if uid is null then
        raise exception 'not_authenticated';
    end if;

    safe_mode := case when lower(coalesce(p_mode, 'solo')) = 'duel' then 'duel' else 'solo' end;
    safe_difficulty := lower(coalesce(p_difficulty, 'easy'));
    safe_attempts := greatest(1, least(coalesce(p_attempts, 1), 999));
    safe_points := greatest(0, least(coalesce(p_points, 0), 5000));
    safe_time := greatest(0, least(coalesce(p_time_seconds, 0), 36000));

    select username into safe_username from public.profiles where id = uid;
    safe_username := lower(coalesce(safe_username, p_username, 'player'));
    if safe_username !~ '^[a-z0-9_]{3,15}$' then
        safe_username := 'player_' || substr(replace(uid::text, '-', ''), 1, 8);
    end if;

    begin
        insert into public.profiles (id, username)
        values (uid, safe_username)
        on conflict (id) do update
            set username = excluded.username,
                updated_at = now();
    exception when unique_violation then
        safe_username := 'player_' || substr(replace(uid::text, '-', ''), 1, 8);
        insert into public.profiles (id, username)
        values (uid, safe_username)
        on conflict (id) do update
            set username = excluded.username,
                updated_at = now();
    end;

    insert into public.scores (user_id, username, mode, difficulty, attempts, points, time_seconds, updated_at)
    values (uid, safe_username, safe_mode, safe_difficulty, safe_attempts, safe_points, safe_time, now())
    on conflict (user_id, mode) do update
        set username = excluded.username,
            difficulty = excluded.difficulty,
            attempts = excluded.attempts,
            points = public.scores.points + excluded.points,
            time_seconds = excluded.time_seconds,
            updated_at = now();
end;
$$;

grant execute on function public.submit_score_secure(text, text, integer, integer, integer, text) to authenticated;

create or replace function public.get_my_points_secure()
returns table(mode text, points integer)
language sql
security invoker
set search_path = public, auth
as $$
    select s.mode, s.points
    from public.scores s
    where s.user_id = auth.uid();
$$;

grant execute on function public.get_my_points_secure() to authenticated;

-- ============================================================
-- Matchmaking queue (direct client access with strict RLS)
-- ============================================================
create table if not exists public.matchmaking_queue (
    id bigint generated always as identity primary key,
    user_id uuid null,
    username text not null,
    difficulty text not null,
    status text not null default 'waiting',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint matchmaking_status_check check (status in ('waiting', 'matched', 'cancelled'))
);

create unique index if not exists matchmaking_unique_waiting_username_idx
on public.matchmaking_queue(username)
where status = 'waiting';

create index if not exists matchmaking_lookup_idx on public.matchmaking_queue(status, difficulty, created_at);
create index if not exists matchmaking_user_status_idx on public.matchmaking_queue(user_id, status);

alter table public.matchmaking_queue alter column user_id drop not null;
alter table public.matchmaking_queue alter column user_id drop default;
alter table public.matchmaking_queue drop constraint if exists matchmaking_queue_user_id_fkey;

drop trigger if exists trg_matchmaking_queue_updated_at on public.matchmaking_queue;
create trigger trg_matchmaking_queue_updated_at
before update on public.matchmaking_queue
for each row execute function public.set_updated_at();

alter table public.matchmaking_queue enable row level security;

revoke all on public.matchmaking_queue from anon, authenticated;
grant select, insert, update, delete on public.matchmaking_queue to anon, authenticated;

drop policy if exists matchmaking_select_authenticated on public.matchmaking_queue;
create policy matchmaking_select_authenticated
on public.matchmaking_queue
for select
to anon, authenticated
using (true);

drop policy if exists matchmaking_insert_self on public.matchmaking_queue;
create policy matchmaking_insert_self
on public.matchmaking_queue
for insert
to anon, authenticated
with check (true);

drop policy if exists matchmaking_update_self on public.matchmaking_queue;
create policy matchmaking_update_self
on public.matchmaking_queue
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists matchmaking_delete_self on public.matchmaking_queue;
create policy matchmaking_delete_self
on public.matchmaking_queue
for delete
to anon, authenticated
using (true);

-- ============================================================
-- Duel rooms (direct client read/write with participant-only RLS)
-- ============================================================
create table if not exists public.duel_rooms (
    id bigint generated always as identity primary key,
    player1 text not null,
    player2 text not null,
    difficulty text not null,
    target1 integer not null,
    target2 integer not null,
    status text not null default 'active',
    winner text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    finished_at timestamptz null,
    constraint duel_status_check check (status in ('active', 'finished', 'abandoned')),
    constraint duel_players_not_equal check (player1 <> player2),
    constraint duel_targets_positive check (target1 > 0 and target2 > 0)
);

create index if not exists duel_rooms_status_created_idx on public.duel_rooms(status, created_at desc);
create index if not exists duel_rooms_player1_status_idx on public.duel_rooms(player1, status);
create index if not exists duel_rooms_player2_status_idx on public.duel_rooms(player2, status);

drop trigger if exists trg_duel_rooms_updated_at on public.duel_rooms;
create trigger trg_duel_rooms_updated_at
before update on public.duel_rooms
for each row execute function public.set_updated_at();

alter table public.duel_rooms enable row level security;

revoke all on public.duel_rooms from anon, authenticated;
grant select, insert, update on public.duel_rooms to anon, authenticated;

drop policy if exists duel_rooms_select_participants on public.duel_rooms;
create policy duel_rooms_select_participants
on public.duel_rooms
for select
to anon, authenticated
using (true);

drop policy if exists duel_rooms_insert_participant on public.duel_rooms;
create policy duel_rooms_insert_participant
on public.duel_rooms
for insert
to anon, authenticated
with check (true);

drop policy if exists duel_rooms_update_participants on public.duel_rooms;
create policy duel_rooms_update_participants
on public.duel_rooms
for update
to anon, authenticated
using (true)
with check (true);

commit;
