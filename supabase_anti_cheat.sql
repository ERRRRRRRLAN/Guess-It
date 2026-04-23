-- ============================================================
-- GUESS IT - 100% ANTI CHEAT V2 (SOLO & DUEL MODE)
-- ============================================================

begin;

-- ============================================================
-- 1. SOLO MODE
-- ============================================================
create table if not exists public.solo_games (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    difficulty text not null,
    target integer not null,
    min_range integer not null,
    max_range integer not null,
    max_lives integer not null,
    lives integer not null,
    status text not null default 'active',
    start_time timestamptz not null default now(),
    history integer[] default '{}',
    points integer default 0
);

alter table public.solo_games enable row level security;
drop policy if exists solo_games_select on public.solo_games;

create or replace function public.start_solo_game(p_difficulty text)
returns uuid
language plpgsql security definer
as $$
declare
    v_target integer;
    v_max integer;
    v_lives integer;
    v_id uuid;
begin
    if p_difficulty = 'easy' then
        v_max := 10; v_lives := 5;
    elsif p_difficulty = 'medium' then
        v_max := 50; v_lives := 7;
    else
        v_max := 100; v_lives := 10;
    end if;

    v_target := floor(random() * v_max) + 1;

    insert into public.solo_games (user_id, difficulty, target, min_range, max_range, max_lives, lives)
    values (auth.uid(), p_difficulty, v_target, 1, v_max, v_lives, v_lives)
    returning id into v_id;

    return v_id;
end;
$$;

create or replace function public.submit_solo_guess(p_session_id uuid, p_guess integer)
returns json
language plpgsql security definer
as $$
declare
    v_game record;
    v_result text;
    v_time_sec integer;
    v_points integer := 0;
begin
    select * into v_game from public.solo_games where id = p_session_id and user_id is not distinct from auth.uid() and status = 'active';
    if not found then return json_build_object('error', 'Game tidak valid'); end if;

    update public.solo_games set history = array_append(history, p_guess) where id = p_session_id;

    if p_guess = v_game.target then
        v_result := 'correct';
        v_time_sec := extract(epoch from (now() - v_game.start_time))::integer;
        
        v_points := greatest(50, 1000 - (v_time_sec * 4) - ((array_length(v_game.history, 1) - 1) * 80));
        if v_game.difficulty = 'easy' then v_points := v_points * 0.5;
        elsif v_game.difficulty = 'hard' then v_points := v_points * 1.5; end if;
        
        update public.solo_games set status = 'won', points = v_points where id = p_session_id;

        if auth.uid() is not null then
            perform public.submit_score_secure('solo', v_game.difficulty, array_length(v_game.history, 1) + 1, v_points, v_time_sec);
        end if;

        return json_build_object('status', v_result, 'points', v_points, 'timeSec', v_time_sec);
    else
        if p_guess < v_game.target then
            v_result := 'too_low';
            update public.solo_games set min_range = greatest(min_range, p_guess + 1), lives = lives - 1 where id = p_session_id;
        else
            v_result := 'too_high';
            update public.solo_games set max_range = least(max_range, p_guess - 1), lives = lives - 1 where id = p_session_id;
        end if;

        if (v_game.lives - 1) <= 0 then
            update public.solo_games set status = 'lost' where id = p_session_id;
            return json_build_object('status', 'lose', 'target', v_game.target);
        end if;

        select min_range, max_range, lives into v_game from public.solo_games where id = p_session_id;
        return json_build_object('status', v_result, 'min', v_game.min_range, 'max', v_game.max_range, 'lives', v_game.lives);
    end if;
end;
$$;

-- ============================================================
-- 2. DUEL MODE
-- ============================================================
-- Sembunyikan target1 dan target2 dari public.duel_rooms
create table if not exists public.duel_secrets (
    room_id bigint primary key references public.duel_rooms(id) on delete cascade,
    target1 integer not null,
    target2 integer not null
);

alter table public.duel_secrets enable row level security;
-- Tidak ada policy SELECT, sepenuhnya tertutup!

create table if not exists public.duel_actions (
    id bigint generated always as identity primary key,
    room_id bigint references public.duel_rooms(id) on delete cascade,
    player text not null,
    action_type text not null,
    payload json not null,
    created_at timestamptz not null default now()
);

alter table public.duel_actions enable row level security;
create policy duel_actions_read on public.duel_actions for select using (true);

-- RPC untuk submit guess mode DUEL
create or replace function public.submit_duel_guess(p_room_id bigint, p_player text, p_guess integer, p_time_sec integer, p_wrong integer, p_history_len integer)
returns json
language plpgsql security definer
as $$
declare
    v_room record;
    v_secret record;
    v_target integer;
    v_result text;
    v_points integer := 0;
begin
    select * into v_room from public.duel_rooms where id = p_room_id;
    if not found then return json_build_object('error', 'Room tidak ditemukan'); end if;

    select * into v_secret from public.duel_secrets where room_id = p_room_id;
    
    if p_player = v_room.player1 then v_target := v_secret.target1; else v_target := v_secret.target2; end if;

    if p_guess = v_target then
        v_result := 'correct';
        v_points := greatest(50, 1000 - (p_time_sec * 4) - (p_wrong * 80));
        if v_room.difficulty = 'easy' then v_points := v_points * 0.5;
        elsif v_room.difficulty = 'hard' then v_points := v_points * 1.5; end if;

        -- Simpan ke tabel actions agar player lain tahu
        insert into public.duel_actions (room_id, player, action_type, payload)
        values (p_room_id, p_player, 'guess_result', json_build_object('status', 'correct', 'points', v_points, 'timeSec', p_time_sec, 'totalGuesses', p_history_len));
        
        -- Simpan skor otomatis ke database
        perform public.submit_score_secure('duel', v_room.difficulty, p_history_len, v_points, p_time_sec);
        
        return json_build_object('status', v_result, 'points', v_points);
    else
        if p_guess < v_target then v_result := 'too_low'; else v_result := 'too_high'; end if;
        
        insert into public.duel_actions (room_id, player, action_type, payload)
        values (p_room_id, p_player, 'guess_result', json_build_object('status', v_result, 'guess', p_guess));

        return json_build_object('status', v_result);
    end if;
end;
$$;

commit;
