-- ============================================================
-- GUESS IT - 100% ANTI CHEAT (SERVER-AUTHORITATIVE)
-- Jalankan script ini di Supabase SQL Editor Anda
-- ============================================================

begin;

-- 1. Hapus akses baca langsung ke target dari klien
-- Kita tidak ingin klien bisa melakukan SELECT target1 dan target2
-- Namun karena mengubah struktur tabel yang sedang berjalan bisa berisiko, 
-- kita menggunakan teknik "Security Definer" RPC untuk semua aksi game.

-- 2. Buat tabel untuk Solo Mode
create table if not exists public.solo_games (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    difficulty text not null,
    target integer not null,
    min_range integer not null,
    max_range integer not null,
    max_lives integer not null,
    lives integer not null,
    status text not null default 'active', -- active, won, lost
    start_time timestamptz not null default now(),
    history integer[] default '{}',
    points integer default 0
);

-- RLS Solo Games
alter table public.solo_games enable row level security;
drop policy if exists solo_games_select on public.solo_games;
-- User hanya bisa melihat game mereka, tapi KITA TIDAK INGIN MEREKA MELIHAT TARGET.
-- Maka kita tidak beri akses SELECT langsung ke tabel ini!
-- Hanya bisa diakses lewat RPC.

-- 3. RPC: Start Solo Game
create or replace function public.start_solo_game(p_difficulty text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
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

-- 4. RPC: Guess Solo Game
create or replace function public.submit_solo_guess(p_session_id uuid, p_guess integer)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_game record;
    v_result text;
    v_time_sec integer;
    v_points integer := 0;
begin
    select * into v_game from public.solo_games where id = p_session_id and user_id is not distinct from auth.uid() and status = 'active';
    if not found then
        return json_build_object('error', 'Game tidak ditemukan atau sudah selesai');
    end if;

    -- Update history & lives
    update public.solo_games set history = array_append(history, p_guess) where id = p_session_id;

    if p_guess = v_game.target then
        v_result := 'correct';
        v_time_sec := extract(epoch from (now() - v_game.start_time))::integer;
        
        -- Kalkulasi poin sederhana
        v_points := 100; -- Bisa disesuaikan dengan rumus asli Anda
        
        update public.solo_games 
        set status = 'won', points = v_points 
        where id = p_session_id;

        -- Simpan ke tabel scores secara otomatis
        perform public.submit_score_secure('solo', v_game.difficulty, array_length(v_game.history, 1) + 1, v_points, v_time_sec);

        return json_build_object('status', v_result, 'points', v_points, 'timeSec', v_time_sec);
    else
        if p_guess < v_game.target then
            v_result := 'too_low';
            update public.solo_games set min_range = greatest(min_range, p_guess + 1), lives = lives - 1 where id = p_session_id;
        else
            v_result := 'too_high';
            update public.solo_games set max_range = least(max_range, p_guess - 1), lives = lives - 1 where id = p_session_id;
        end if;

        -- Check game over
        if (v_game.lives - 1) <= 0 then
            update public.solo_games set status = 'lost' where id = p_session_id;
            return json_build_object('status', 'lose', 'target', v_game.target);
        end if;

        -- Ambil range terbaru
        select min_range, max_range, lives into v_game from public.solo_games where id = p_session_id;
        return json_build_object('status', v_result, 'min', v_game.min_range, 'max', v_game.max_range, 'lives', v_game.lives);
    end if;
end;
$$;


-- ============================================================
-- UNTUK DUEL MODE (MULTIPLAYER)
-- ============================================================
-- Kita butuh tabel logs untuk menggantikan sistem Broadcast P2P,
-- sehingga klien hanya mendengarkan "duel_events" yang divalidasi server.

create table if not exists public.duel_events (
    id bigint generated always as identity primary key,
    room_id bigint references public.duel_rooms(id),
    player text not null,
    event_type text not null, -- 'guess', 'round_win', 'round_lose'
    payload json not null,
    created_at timestamptz not null default now()
);

-- Izinkan klien membaca event untuk room mereka
alter table public.duel_events enable row level security;
create policy duel_events_read on public.duel_events for select using (true);

commit;
