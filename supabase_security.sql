-- Guess It - Security hardening migration
-- Run this in Supabase SQL Editor (project: pfzdtwvsghdwchrmogap)

begin;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,15}$')
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    candidate text;
begin
    candidate := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
    if candidate !~ '^[a-z0-9_]{3,15}$' then
        candidate := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
    end if;

    insert into public.profiles (id, username)
    values (new.id, candidate)
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create table if not exists public.scores (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
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

alter table public.scores add column if not exists user_id uuid;
alter table public.scores add column if not exists updated_at timestamptz not null default now();
alter table public.scores add column if not exists created_at timestamptz not null default now();

create unique index if not exists scores_user_mode_unique_idx on public.scores(user_id, mode);
create index if not exists scores_mode_points_idx on public.scores(mode, points desc, time_seconds asc);

alter table public.scores enable row level security;

drop policy if exists scores_public_read on public.scores;
create policy scores_public_read
on public.scores
for select
to anon, authenticated
using (true);

-- Block direct client writes to scores; writes must go through secure RPC.
revoke insert, update, delete on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;

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

    insert into public.profiles (id, username)
    values (uid, safe_username)
    on conflict (id) do update
        set username = excluded.username,
            updated_at = now();

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

commit;

