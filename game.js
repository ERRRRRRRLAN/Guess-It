// Supabase Configuration
const SUPABASE_URL = 'https://pfzdtwvsghdwchrmogap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmemR0d3ZzZ2hkd2Nocm1vZ2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM1MzgsImV4cCI6MjA4NjM3OTUzOH0.dfD5GF7luaWCJ_nL-kjMIh51D143fw93mbgsIDYutUQ';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ============================================================
// GAME STATE
// ============================================================
let gameState = {
    targetNumber: 0, maxLives: 0, currentLives: 0,
    minRange: 1, maxRange: 100, history: [],
    difficulty: '', currentUser: null, mode: 'solo',
    wrongGuesses: 0,
};

// ============================================================
// CUSTOM AUTH
// ============================================================
const SESSION_KEY = 'guess_it_user_session';

async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let lastAuthAttempt = 0;
function isRateLimited() {
    const now = Date.now();
    if (now - lastAuthAttempt < 2000) return true;
    lastAuthAttempt = now;
    return false;
}

const userAuth = {
    register: async () => {
        if (isRateLimited()) { setFeedback("> TUNGGU SEBENTAR...", true); return; }
        const user = document.getElementById('reg-user').value.trim().toLowerCase();
        const pass = document.getElementById('reg-pass').value.trim();
        if (!user || !pass) { setFeedback("> ISI SEMUA DATA", true); return; }
        if (user.length < 3) { setFeedback("> USERNAME MIN 3 KARAKTER", true); return; }
        if (pass.length < 6) { setFeedback("> PASSWORD MIN 6 KARAKTER", true); return; }
        const regBtn = document.querySelector('#page-register .btn-primary');
        regBtn.disabled = true; regBtn.innerText = "PROSES...";
        const { data: existing } = await supabaseClient.from('users').select('username').eq('username', user).maybeSingle();
        if (existing) { setFeedback("> USERNAME SUDAH DIPAKAI", true); regBtn.disabled = false; regBtn.innerText = "BUAT AKUN"; return; }
        const hashedPass = await hashPassword(pass);
        const { error } = await supabaseClient.from('users').insert([{ username: user, password_hash: hashedPass }]);
        if (error) { setFeedback(`> ERROR: ${error.message.toUpperCase()}`, true); regBtn.disabled = false; regBtn.innerText = "BUAT AKUN"; return; }
        setFeedback("> DAFTAR BERHASIL! SILAKAN LOGIN", false);
        setTimeout(() => showPage('page-login'), 1500);
    },
    login: async () => {
        if (isRateLimited()) { setFeedback("> TUNGGU SEBENTAR...", true); return; }
        const user = document.getElementById('login-user').value.trim().toLowerCase();
        const pass = document.getElementById('login-pass').value.trim();
        const loginBtn = document.querySelector('#page-login .btn-primary');
        loginBtn.disabled = true; loginBtn.innerText = "VERIFIKASI...";
        const hashedPass = await hashPassword(pass);
        const { data, error } = await supabaseClient.from('users').select('username, password_hash').eq('username', user).eq('password_hash', hashedPass).single();
        if (error || !data) { setFeedback("> DATA SALAH", true); triggerFlash('flash-red'); loginBtn.disabled = false; loginBtn.innerText = "LOGIN"; return; }
        localStorage.setItem(SESSION_KEY, data.username);
        gameState.currentUser = data.username;
        userAuth.updateUI(); showPage('page-menu'); triggerGlobalGlitch(300, 'success');
    },
    logout: () => {
        localStorage.removeItem(SESSION_KEY);
        gameState.currentUser = null;
        userAuth.updateUI(); showPage('page-menu'); triggerGlobalGlitch(300, 'error');
    },
    checkSession: () => {
        const saved = localStorage.getItem(SESSION_KEY);
        if (saved) gameState.currentUser = saved;
        userAuth.updateUI();
    },
    updateUI: () => {
        const profile = document.getElementById('user-profile');
        const display = document.getElementById('display-username');
        const authActions = document.getElementById('auth-actions');
        const logoutBtn = document.querySelector('.logout-btn');
        if (gameState.currentUser) {
            profile.style.display = 'flex';
            display.innerText = gameState.currentUser.toUpperCase();
            logoutBtn.style.display = 'block'; authActions.style.display = 'none';
        } else {
            profile.style.display = 'flex';
            display.innerText = "GUEST";
            logoutBtn.style.display = 'none'; authActions.style.display = 'flex';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => { userAuth.checkSession(); });

// ============================================================
// DIFFICULTIES & MULTIPLIER
// ============================================================
const difficulties = {
    easy:   { max: 10,  lives: 5,  multiplier: 0.5 },
    medium: { max: 50,  lives: 7,  multiplier: 1.0 },
    hard:   { max: 100, lives: 10, multiplier: 1.5 }
};

// ============================================================
// PAGE MANAGEMENT
// ============================================================
const pages = ['page-menu', 'page-difficulty', 'page-game', 'page-result', 'page-leaderboard', 'page-login', 'page-register', 'page-matchmaking'];
const inputField = document.getElementById('guess-input');
const backBtn = document.getElementById('back-btn');

function showPage(pageId, isPopState = false) {
    document.getElementById('duel-arena').style.display = 'none';
    document.getElementById('main-wrapper-solo').style.display = '';
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) { if (id === pageId) el.classList.add('active'); else el.classList.remove('active'); }
    });
    if (!isPopState) history.pushState({ pageId }, '', '#' + pageId);
    if (pageId === 'page-menu' || pageId === 'page-result') backBtn.classList.remove('visible');
    else backBtn.classList.add('visible');
    triggerGlobalGlitch();
    if (pageId === 'page-game') { inputField.value = ''; inputField.focus(); document.getElementById('feedback-msg').innerText = ''; }
}

window.onpopstate = (e) => { showPage(e.state ? e.state.pageId : 'page-menu', true); };
function goBack() { history.back(); }

// ============================================================
// MODE SELECTION
// ============================================================
function selectMode(mode) {
    gameState.mode = mode;
    if (mode === 'solo') {
        document.getElementById('diff-subtitle').innerHTML = '&gt; PILIH_LEVEL';
        showPage('page-difficulty');
    } else {
        // Duel requires login
        if (!gameState.currentUser) {
            setFeedback("> LOGIN DULU UNTUK DUEL", true);
            triggerFlash('flash-red');
            return;
        }
        document.getElementById('diff-subtitle').innerHTML = '&gt; PILIH_LEVEL_DUEL';
        showPage('page-difficulty');
    }
}

// ============================================================
// STOPWATCH UTILITIES
// ============================================================
function startTimer(displayId) {
    const display = document.getElementById(displayId);
    const start = Date.now();
    return {
        startTime: start,
        interval: setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            display.innerText = formatTime(elapsed);
        }, 100)
    };
}

function stopTimer(timerObj) {
    if (timerObj && timerObj.interval) clearInterval(timerObj.interval);
    if (timerObj) return (Date.now() - timerObj.startTime) / 1000;
    return 0;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    const tenths = Math.floor((seconds * 10) % 10);
    return `${mins}:${secs}.${tenths}`;
}

// ============================================================
// POINTS CALCULATION (with difficulty multiplier)
// ============================================================
function calcPoints(timeSec, wrongCount, difficulty) {
    const BASE = 1000;
    const timePen = Math.min(Math.round(timeSec * 4), 600);
    const wrongPen = wrongCount * 80;
    const raw = Math.max(50, BASE - timePen - wrongPen);
    const mult = difficulties[difficulty] ? difficulties[difficulty].multiplier : 1.0;
    return Math.round(raw * mult);
}

// ============================================================
// SOLO GAME
// ============================================================
let soloTimer = null;

function startGame(level) {
    if (gameState.mode === 'duel') {
        enterMatchmaking(level);
        return;
    }

    const config = difficulties[level];
    const user = gameState.currentUser;
    gameState = {
        difficulty: level, maxRange: config.max, minRange: 1,
        maxLives: config.lives, currentLives: config.lives,
        targetNumber: Math.floor(Math.random() * config.max) + 1,
        history: [], currentUser: user, mode: 'solo', wrongGuesses: 0,
    };
    updateStatsUI();
    renderHearts('hearts-container', config.lives);
    document.getElementById('history-list').innerHTML = '';
    document.getElementById('stopwatch').innerText = '00:00.0';
    showPage('page-game');
    soloTimer = startTimer('stopwatch');
    console.log(`[SOLO] Target: ${gameState.targetNumber}`);
}

function renderHearts(containerId, total) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const heart = document.createElement('div');
        heart.innerHTML = `<svg class="heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
        container.appendChild(heart.firstChild);
    }
}

function updateStatsUI() {
    document.getElementById('low-display').innerText = gameState.minRange;
    document.getElementById('high-display').innerText = gameState.maxRange;
}

function checkGuess() {
    const guess = parseInt(inputField.value);
    if (isNaN(guess) || guess < gameState.minRange || guess > gameState.maxRange) {
        triggerFlash('flash-red'); setFeedback("ANGKA_LUAR_BATAS", true); return;
    }
    gameState.history.push(guess);
    updateHistoryUI(guess, 'history-list');

    if (guess === gameState.targetNumber) {
        const elapsed = stopTimer(soloTimer);
        const sp = calcPoints(elapsed, gameState.wrongGuesses, gameState.difficulty);
        triggerFlash('flash-cyan'); triggerGlobalGlitch(400, 'success');
        showSoloResult(true, elapsed, sp);
    } else {
        gameState.currentLives--; gameState.wrongGuesses++;
        updateHeartsUI('hearts-container', gameState.currentLives);
        triggerFlash('flash-red'); triggerGlobalGlitch(250, 'error');
        if (gameState.currentLives <= 0) {
            const elapsed = stopTimer(soloTimer);
            showSoloResult(false, elapsed, 0);
        } else {
            let hint;
            if (guess < gameState.targetNumber) {
                gameState.minRange = Math.max(gameState.minRange, guess + 1);
                hint = `&gt; TERLALU_RENDAH: TEBAK_${gameState.minRange}_KE_${gameState.maxRange}`;
            } else {
                gameState.maxRange = Math.min(gameState.maxRange, guess - 1);
                hint = `&gt; TERLALU_TINGGI: TEBAK_${gameState.minRange}_KE_${gameState.maxRange}`;
            }
            updateStatsUI(); setFeedback(hint, true);
            inputField.value = ''; inputField.focus();
        }
    }
}

function updateHeartsUI(containerId, current) {
    const hearts = document.querySelectorAll(`#${containerId} .heart`);
    if (hearts[current]) hearts[current].classList.add('lost');
}

function updateHistoryUI(guess, listId) {
    const list = document.getElementById(listId);
    const tag = document.createElement('span');
    tag.className = 'hist-tag'; tag.innerText = `[${guess}]`;
    list.prepend(tag);
}

function showSoloResult(isWin, timeSec, points) {
    const content = document.getElementById('result-content');
    const subText = isWin
        ? `Kamu hebat! Angkanya adalah: ${gameState.targetNumber}`
        : `Sayang sekali. Angkanya adalah: ${gameState.targetNumber}`;
    let extraInfo = "";
    if (isWin) {
        const attempts = gameState.history.length;
        const timeStr = formatTime(timeSec);
        const pointsDisplay = `<div class="win-text-small" style="font-size:1.5rem; color:var(--neon-magenta); margin:0.5rem 0;">${points} SP</div>`;
        const statsDisplay = `<div class="win-text-small">${attempts} tebakan · ${timeStr} · ${gameState.wrongGuesses} salah · ×${difficulties[gameState.difficulty].multiplier}</div>`;
        if (gameState.currentUser) {
            extraInfo = `${pointsDisplay}${statsDisplay}
                <div class="name-entry-area">
                    <input type="text" id="player-name" value="${gameState.currentUser.toUpperCase()}" placeholder="MASUKKAN NAMA" maxlength="10">
                    <button class="btn btn-primary" id="save-score-btn" onclick="handleSaveScore(${Math.round(timeSec)}, ${points})">SIMPAN REKOR</button>
                </div>`;
        } else {
            extraInfo = `${pointsDisplay}${statsDisplay}
                <div class="guest-notice"><p>&gt; DAFTAR_LOGIN_UNTUK_SIMPAN_SKOR</p>
                    <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                        <button class="btn btn-outline" style="font-size:0.7rem; padding:0.5rem;" onclick="showPage('page-login')">LOGIN</button>
                        <button class="btn btn-outline" style="font-size:0.7rem; padding:0.5rem;" onclick="showPage('page-register')">BUAT AKUN</button>
                    </div></div>`;
        }
    }
    content.innerHTML = `
        <div class="result-status ${isWin ? 'win-color' : 'lose-color'}">${isWin ? 'MENANG' : 'KALAH'}</div>
        <h1 style="-webkit-text-fill-color:initial; color:#fff;">${isWin ? 'BERHASIL' : 'GAGAL'}</h1>
        <p class="subtitle" style="color:var(--text-dim)">&gt; ${subText}</p>${extraInfo}`;
    showPage('page-result');
}

// ============================================================
// ONLINE DUEL — MATCHMAKING
// ============================================================
let matchmakingQueueId = null;
let matchmakingChannel = null;
let matchmakingPollInterval = null;

async function enterMatchmaking(difficulty) {
    if (!gameState.currentUser) { setFeedback("> LOGIN DULU", true); return; }

    showPage('page-matchmaking');
    document.getElementById('matchmaking-diff-label').innerText = `LEVEL: ${difficulty.toUpperCase()}`;
    document.getElementById('matchmaking-status').innerHTML = '&gt; MENUNGGU_PLAYER_LAIN...';

    // 1. Check if there's already someone waiting with the same difficulty
    const { data: waiting } = await supabaseClient
        .from('matchmaking_queue')
        .select('*')
        .eq('difficulty', difficulty)
        .eq('status', 'waiting')
        .neq('username', gameState.currentUser)
        .order('created_at', { ascending: true })
        .limit(1);

    if (waiting && waiting.length > 0) {
        // Found a match! Create a duel room
        const opponent = waiting[0];
        await createDuelRoom(opponent, difficulty);
        return;
    }

    // 2. No match — enter queue and wait
    const { data: inserted, error } = await supabaseClient
        .from('matchmaking_queue')
        .insert([{ username: gameState.currentUser, difficulty: difficulty, status: 'waiting' }])
        .select()
        .single();

    if (error) {
        console.error("Matchmaking insert error:", error);
        setFeedback("> ERROR MATCHMAKING", true);
        showPage('page-menu');
        return;
    }

    matchmakingQueueId = inserted.id;

    // 3. Subscribe to duel_rooms for this user
    matchmakingChannel = supabaseClient
        .channel('matchmaking-' + gameState.currentUser)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'duel_rooms' },
            (payload) => {
                const room = payload.new;
                if (room.player1 === gameState.currentUser || room.player2 === gameState.currentUser) {
                    console.log('[MATCH FOUND via Realtime]', room);
                    cleanupMatchmaking();
                    joinDuelRoom(room);
                }
            }
        )
        .subscribe();

    // 4. Also poll as fallback (every 2s)
    matchmakingPollInterval = setInterval(async () => {
        const { data: rooms } = await supabaseClient
            .from('duel_rooms')
            .select('*')
            .eq('status', 'active')
            .or(`player1.eq.${gameState.currentUser},player2.eq.${gameState.currentUser}`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (rooms && rooms.length > 0) {
            console.log('[MATCH FOUND via Poll]', rooms[0]);
            cleanupMatchmaking();
            joinDuelRoom(rooms[0]);
        }
    }, 2000);
}

async function createDuelRoom(opponent, difficulty) {
    const config = difficulties[difficulty];

    // Generate two different targets
    const target1 = Math.floor(Math.random() * config.max) + 1;
    let target2 = Math.floor(Math.random() * config.max) + 1;
    while (target2 === target1 && config.max > 1) target2 = Math.floor(Math.random() * config.max) + 1;

    // Remove opponent from queue
    await supabaseClient.from('matchmaking_queue').delete().eq('id', opponent.id);

    // Create room — opponent is player1 (they were waiting), we are player2
    const { data: room, error } = await supabaseClient
        .from('duel_rooms')
        .insert([{
            player1: opponent.username,
            player2: gameState.currentUser,
            difficulty: difficulty,
            target1: target1,
            target2: target2,
            status: 'active'
        }])
        .select()
        .single();

    if (error) {
        console.error("Create room error:", error);
        setFeedback("> ERROR MEMBUAT ROOM", true);
        showPage('page-menu');
        return;
    }

    console.log('[ROOM CREATED]', room);
    cleanupMatchmaking();
    joinDuelRoom(room);
}

async function cancelMatchmaking() {
    if (matchmakingQueueId) {
        await supabaseClient.from('matchmaking_queue').delete().eq('id', matchmakingQueueId);
    }
    cleanupMatchmaking();
    showPage('page-menu');
}

function cleanupMatchmaking() {
    matchmakingQueueId = null;
    if (matchmakingChannel) { supabaseClient.removeChannel(matchmakingChannel); matchmakingChannel = null; }
    if (matchmakingPollInterval) { clearInterval(matchmakingPollInterval); matchmakingPollInterval = null; }
}

// ============================================================
// ONLINE DUEL — GAME ROOM
// ============================================================
let duel = {
    room: null,
    myRole: null,       // 'player1' or 'player2'
    myTarget: 0,
    oppName: '',
    lives: 0, maxLives: 0, min: 1, max: 100,
    history: [], wrong: 0, done: false,
    timer: null,
    channel: null,
    // Opponent state (for display)
    oppLives: 0, oppMaxLives: 0, oppMin: 1, oppMax: 100,
    oppWrong: 0, oppDone: false, oppWon: false,
    oppHistory: [], oppTimeSec: 0, oppPoints: 0,
};

function joinDuelRoom(room) {
    const config = difficulties[room.difficulty];
    const isP1 = room.player1 === gameState.currentUser;

    duel = {
        room: room,
        myRole: isP1 ? 'player1' : 'player2',
        myTarget: isP1 ? room.target1 : room.target2,
        oppName: isP1 ? room.player2 : room.player1,
        lives: config.lives, maxLives: config.lives,
        min: 1, max: config.max,
        history: [], wrong: 0, done: false, won: false,
        timer: null, channel: null,
        timeSec: 0, points: 0,
        oppLives: config.lives, oppMaxLives: config.lives,
        oppMin: 1, oppMax: config.max,
        oppWrong: 0, oppDone: false, oppWon: false,
        oppHistory: [], oppTimeSec: 0, oppPoints: 0,
        difficulty: room.difficulty,
    };

    // Setup UI
    document.getElementById('main-wrapper-solo').style.display = 'none';
    document.getElementById('duel-arena').style.display = 'block';
    pages.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });

    document.getElementById('duel-opponent-name').innerText = duel.oppName.toUpperCase();
    document.getElementById('opp-label').innerText = duel.oppName.toUpperCase();

    // Reset panels
    document.getElementById('duel-my').classList.remove('finished', 'winner');
    document.getElementById('duel-opp').classList.remove('finished', 'winner');

    renderHearts('hearts-my', config.lives);
    renderHearts('hearts-opp', config.lives);

    document.getElementById('low-my').innerText = 1;
    document.getElementById('high-my').innerText = config.max;
    document.getElementById('low-opp').innerText = 1;
    document.getElementById('high-opp').innerText = config.max;

    document.getElementById('guess-my').value = '';
    document.getElementById('feedback-my').innerText = '';
    document.getElementById('feedback-opp').innerText = '';
    document.getElementById('history-my').innerHTML = '';
    document.getElementById('history-opp').innerHTML = '';
    document.getElementById('stopwatch-my').innerText = '00:00.0';
    document.getElementById('stopwatch-opp').innerText = '00:00.0';
    document.getElementById('opp-status').innerHTML = '<span>MENUNGGU TEBAKAN...</span>';

    // Start my timer
    duel.timer = startTimer('stopwatch-my');
    // Start opponent display timer
    duel.oppTimerStart = Date.now();
    duel.oppTimerInterval = setInterval(() => {
        if (!duel.oppDone) {
            const elapsed = (Date.now() - duel.oppTimerStart) / 1000;
            document.getElementById('stopwatch-opp').innerText = formatTime(elapsed);
        }
    }, 100);

    // Subscribe to Realtime broadcast channel for this room
    const channelName = `duel-room-${room.id}`;
    duel.channel = supabaseClient.channel(channelName)
        .on('broadcast', { event: 'guess' }, (payload) => {
            handleOpponentBroadcast(payload.payload);
        })
        .subscribe();

    console.log(`[DUEL JOINED] Room: ${room.id}, I am ${duel.myRole}, target: ${duel.myTarget}, opponent: ${duel.oppName}`);
}

function submitDuelGuess() {
    if (duel.done) return;

    const input = document.getElementById('guess-my');
    const guess = parseInt(input.value);

    if (isNaN(guess) || guess < duel.min || guess > duel.max) {
        triggerFlash('flash-red');
        document.getElementById('feedback-my').innerHTML = 'ANGKA_LUAR_BATAS';
        return;
    }

    duel.history.push(guess);
    updateHistoryUI(guess, 'history-my');

    if (guess === duel.myTarget) {
        // WIN
        duel.done = true;
        duel.won = true;
        duel.timeSec = stopTimer(duel.timer);
        duel.points = calcPoints(duel.timeSec, duel.wrong, duel.difficulty);

        document.getElementById('feedback-my').innerHTML = `✓ BENAR! ${duel.points} DP`;
        document.getElementById('duel-my').classList.add('finished', 'winner');
        triggerFlash('flash-cyan');

        // Broadcast to opponent
        broadcastGuessResult({ won: true, timeSec: duel.timeSec, points: duel.points, wrong: duel.wrong, totalGuesses: duel.history.length });

        // Save score
        if (gameState.currentUser) {
            saveScore(duel.difficulty, duel.history.length, gameState.currentUser.toUpperCase(), 'duel', duel.points, Math.round(duel.timeSec));
        }

        if (duel.oppDone) showDuelResult();
    } else {
        duel.lives--;
        duel.wrong++;
        updateHeartsUI('hearts-my', duel.lives);
        triggerFlash('flash-red');

        if (duel.lives <= 0) {
            duel.done = true;
            duel.won = false;
            duel.timeSec = stopTimer(duel.timer);
            duel.points = 0;

            document.getElementById('feedback-my').innerHTML = `✗ KALAH! Angka: ${duel.myTarget}`;
            document.getElementById('duel-my').classList.add('finished');

            broadcastGuessResult({ won: false, timeSec: duel.timeSec, points: 0, wrong: duel.wrong, totalGuesses: duel.history.length });

            if (duel.oppDone) showDuelResult();
        } else {
            let feedbackText;
            if (guess < duel.myTarget) {
                duel.min = Math.max(duel.min, guess + 1);
                feedbackText = `&gt; RENDAH: ${duel.min}-${duel.max}`;
            } else {
                duel.max = Math.min(duel.max, guess - 1);
                feedbackText = `&gt; TINGGI: ${duel.min}-${duel.max}`;
            }
            document.getElementById('feedback-my').innerHTML = feedbackText;
            document.getElementById('low-my').innerText = duel.min;
            document.getElementById('high-my').innerText = duel.max;
            input.value = ''; input.focus();

            // Broadcast range/lives update
            broadcastGuessResult({
                won: false, still_playing: true,
                lives: duel.lives, min: duel.min, max: duel.max,
                wrong: duel.wrong, totalGuesses: duel.history.length,
                lastGuess: guess
            });
        }
    }
}

function broadcastGuessResult(data) {
    if (!duel.channel) return;
    duel.channel.send({
        type: 'broadcast',
        event: 'guess',
        payload: { sender: gameState.currentUser, ...data }
    });
}

function handleOpponentBroadcast(data) {
    if (data.sender === gameState.currentUser) return; // Ignore own broadcasts

    if (data.won === true) {
        // Opponent won
        duel.oppDone = true;
        duel.oppWon = true;
        duel.oppTimeSec = data.timeSec;
        duel.oppPoints = data.points;
        duel.oppWrong = data.wrong;
        clearInterval(duel.oppTimerInterval);
        document.getElementById('stopwatch-opp').innerText = formatTime(data.timeSec);
        document.getElementById('feedback-opp').innerHTML = `✓ BENAR! ${data.points} DP`;
        document.getElementById('duel-opp').classList.add('finished', 'winner');
        document.getElementById('opp-status').innerHTML = `<span>SELESAI — ${data.points} DP</span>`;
        if (duel.done) showDuelResult();
    } else if (data.won === false && !data.still_playing) {
        // Opponent lost
        duel.oppDone = true;
        duel.oppWon = false;
        duel.oppTimeSec = data.timeSec;
        duel.oppPoints = 0;
        duel.oppWrong = data.wrong;
        clearInterval(duel.oppTimerInterval);
        document.getElementById('stopwatch-opp').innerText = formatTime(data.timeSec);
        document.getElementById('feedback-opp').innerHTML = `✗ KALAH`;
        document.getElementById('duel-opp').classList.add('finished');
        document.getElementById('opp-status').innerHTML = '<span>KALAH</span>';
        if (duel.done) showDuelResult();
    } else if (data.still_playing) {
        // Opponent made a guess but still playing
        duel.oppLives = data.lives;
        duel.oppMin = data.min;
        duel.oppMax = data.max;
        duel.oppWrong = data.wrong;

        // Update opponent hearts
        updateHeartsUI('hearts-opp', data.lives);

        // Update opponent range
        document.getElementById('low-opp').innerText = data.min;
        document.getElementById('high-opp').innerText = data.max;

        // Update opponent history
        if (data.lastGuess) {
            duel.oppHistory.push(data.lastGuess);
            updateHistoryUI(data.lastGuess, 'history-opp');
        }

        // Update status
        const direction = data.lastGuess ? `Tebakan: [${data.lastGuess}]` : '';
        document.getElementById('opp-status').innerHTML = `<span>${direction} · ${data.wrong} salah</span>`;
        document.getElementById('feedback-opp').innerHTML = `&gt; ${data.min}-${data.max} · ${data.wrong} salah`;
    }
}

function showDuelResult() {
    stopTimer(duel.timer);
    clearInterval(duel.oppTimerInterval);

    // Clean up channel
    if (duel.channel) { supabaseClient.removeChannel(duel.channel); duel.channel = null; }

    // Update room status
    if (duel.room) {
        const winner = duel.won && !duel.oppWon ? gameState.currentUser
            : !duel.won && duel.oppWon ? duel.oppName
            : duel.won && duel.oppWon ? (duel.timeSec < duel.oppTimeSec ? gameState.currentUser : duel.oppName)
            : null;
        supabaseClient.from('duel_rooms').update({ status: 'finished', winner: winner }).eq('id', duel.room.id).then(() => {});
    }

    const myName = gameState.currentUser.toUpperCase();
    const oppName = duel.oppName.toUpperCase();
    let winnerLabel;
    if (duel.won && duel.oppWon) {
        winnerLabel = duel.timeSec < duel.oppTimeSec ? myName : oppName;
    } else if (duel.won) {
        winnerLabel = myName;
    } else if (duel.oppWon) {
        winnerLabel = oppName;
    } else {
        winnerLabel = 'TIDAK ADA';
    }

    const content = document.getElementById('duel-result-content');
    content.innerHTML = `
        <div class="result-status win-color">DUEL SELESAI</div>
        <h1 style="-webkit-text-fill-color:initial; color:#fff;">PEMENANG: ${winnerLabel}</h1>
        <div style="display:flex; gap:1rem; margin-top:1.5rem; justify-content:center; flex-wrap:wrap;">
            <div style="flex:1; min-width:180px; padding:1rem; border:1px solid rgba(255,255,255,0.1); background:rgba(0,242,255,0.03);">
                <div class="duel-player-label duel-label-me">${myName} (KAMU)</div>
                <div style="font-size:1.5rem; font-weight:700; color:var(--neon-magenta); font-family:var(--font-data);">${duel.won ? duel.points + ' DP' : 'KALAH'}</div>
                <div class="win-text-small">${duel.history.length} tebakan · ${formatTime(duel.timeSec)} · ${duel.wrong} salah</div>
            </div>
            <div style="flex:1; min-width:180px; padding:1rem; border:1px solid rgba(255,255,255,0.1); background:rgba(0,242,255,0.03);">
                <div class="duel-player-label">${oppName}</div>
                <div style="font-size:1.5rem; font-weight:700; color:var(--neon-magenta); font-family:var(--font-data);">${duel.oppWon ? duel.oppPoints + ' DP' : 'KALAH'}</div>
                <div class="win-text-small">${duel.oppHistory.length} tebakan · ${formatTime(duel.oppTimeSec)} · ${duel.oppWrong} salah</div>
            </div>
        </div>`;

    document.getElementById('duel-result-overlay').style.display = 'flex';
    triggerGlobalGlitch(400, 'success');
}

function exitDuel() {
    stopTimer(duel.timer);
    if (duel.oppTimerInterval) clearInterval(duel.oppTimerInterval);
    if (duel.channel) { supabaseClient.removeChannel(duel.channel); duel.channel = null; }
    cleanupMatchmaking();
    document.getElementById('duel-arena').style.display = 'none';
    document.getElementById('duel-result-overlay').style.display = 'none';
    document.getElementById('main-wrapper-solo').style.display = '';
}

// ============================================================
// SCORE SAVING
// ============================================================
async function saveScore(difficulty, attempts, name, mode, points, timeSec) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from('scores').insert([{
        username: name, difficulty: difficulty, attempts: attempts,
        mode: mode || 'solo', points: points || 0, time_seconds: timeSec || 0
    }]);
    if (error) console.error("Error saving score:", error);
}

async function handleSaveScore(timeSec, points) {
    const nameInput = document.getElementById('player-name');
    const saveBtn = document.getElementById('save-score-btn');
    const name = nameInput.value.trim().toUpperCase() || "PLAYER";
    nameInput.disabled = true; saveBtn.disabled = true; saveBtn.innerText = "MENYIMPAN...";
    await saveScore(gameState.difficulty, gameState.history.length, name, 'solo', points, timeSec);
    saveBtn.innerText = "TERSIMPAN!";
    triggerGlobalGlitch(300, 'success');
}

// ============================================================
// LEADERBOARD
// ============================================================
let currentLeaderboardTab = 'solo';

function switchLeaderboardTab(tab) {
    currentLeaderboardTab = tab;
    document.getElementById('lb-tab-solo').classList.toggle('active', tab === 'solo');
    document.getElementById('lb-tab-duel').classList.toggle('active', tab === 'duel');
    loadLeaderboardData(tab);
}

async function showLeaderboard() {
    currentLeaderboardTab = 'solo';
    document.getElementById('lb-tab-solo').classList.add('active');
    document.getElementById('lb-tab-duel').classList.remove('active');
    showPage('page-leaderboard');
    await loadLeaderboardData('solo');
}

async function loadLeaderboardData(mode) {
    const container = document.getElementById('leaderboard-content');
    container.innerHTML = '<p class="subtitle" style="text-align:center; opacity:0.5; margin-top:2rem;">&gt; MENGAMBIL_DATA...</p>';
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('scores').select('*').eq('mode', mode)
        .order('points', { ascending: false }).order('time_seconds', { ascending: true }).limit(10);

    if (error) { container.innerHTML = '<p class="subtitle" style="text-align:center; color:var(--accent-red);">GAGAL MENGHUBUNGI SERVER</p>'; return; }
    container.innerHTML = '';
    if (!data || data.length === 0) { container.innerHTML = '<p class="subtitle" style="text-align:center; opacity:0.5; margin-top:2rem;">BELUM ADA REKOR</p>'; return; }

    const pointLabel = mode === 'solo' ? 'SP' : 'DP';
    data.forEach((entry, index) => {
        const el = document.createElement('div');
        el.className = 'score-entry';
        el.style.animationDelay = `${index * 0.1}s`;
        const dateStr = new Date(entry.created_at).toLocaleDateString();
        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <span class="rank-tag">#${index + 1}</span>
                <span class="player-name-tag">${(entry.username || 'USER').toUpperCase()}</span>
                <span class="diff-tag">${entry.difficulty.toUpperCase()}</span>
            </div>
            <div style="display:flex; align-items:center; gap:1rem;">
                <span class="score-value">${entry.points || 0} ${pointLabel}</span>
                <span style="font-size:0.6rem; color:var(--text-dim);">${dateStr}</span>
            </div>`;
        container.appendChild(el);
    });
}

// ============================================================
// GLITCH EFFECTS (preserved)
// ============================================================
function triggerFlash(className) {
    const flash = document.getElementById('screen-flash');
    flash.className = 'screen-flash ' + className;
    setTimeout(() => { flash.className = 'screen-flash'; }, 300);
}

function triggerGlobalGlitch(duration = 200, type = 'neutral') {
    const wrapper = document.querySelector('.main-wrapper');
    if (!wrapper) return;
    const scanline = document.querySelector('.scanlines');
    let glitchClass = 'glitch-active';
    let blockGradient = 'repeating-linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta) 50px)';
    if (type === 'error') { glitchClass = 'glitch-error'; blockGradient = 'repeating-linear-gradient(90deg, #ff0000, #550000 50px)'; }
    else if (type === 'success') { glitchClass = 'glitch-success'; blockGradient = 'repeating-linear-gradient(90deg, #00f2ff, #ffffff 50px)'; }
    wrapper.classList.add(glitchClass);
    if (type !== 'neutral') wrapper.classList.add('glitch-intense');
    if (scanline) { if (type === 'error') scanline.classList.add('scanline-error'); else scanline.classList.add('scanline-flicker'); }
    const jitterClass = type === 'success' ? 'wrapper-light-burst' : 'wrapper-jitter';
    wrapper.classList.remove(jitterClass); void wrapper.offsetWidth; wrapper.classList.add(jitterClass);
    const elementsToRemove = [];
    const streakCount = type === 'neutral' ? 1 : 3;
    for (let i = 0; i < streakCount; i++) {
        const streak = document.createElement('div'); streak.className = 'neon-streak';
        streak.style.top = (Math.random() * 95 + 2) + '%';
        streak.style.setProperty('--streak-dur', (0.4 + Math.random() * 0.4) + 's');
        if (type === 'error') streak.style.background = 'linear-gradient(90deg, transparent, #ff3e00, #ff0000, transparent)';
        if (type === 'success') streak.style.background = 'linear-gradient(90deg, transparent, #00f2ff, #ffffff, transparent)';
        document.body.appendChild(streak); elementsToRemove.push(streak);
    }
    const blockCount = type === 'neutral' ? 2 : 6;
    for (let i = 0; i < blockCount; i++) {
        const b = document.createElement('div'); b.className = 'signal-block';
        b.style.setProperty('--block-color', blockGradient);
        b.style.top = (Math.random() * 90) + '%'; b.style.height = (Math.random() * 15 + 5) + '%';
        wrapper.appendChild(b); elementsToRemove.push(b);
    }
    const beam = document.createElement('div'); beam.className = 'scan-beam';
    beam.style.setProperty('--beam-dur', (duration / 1000).toFixed(2) + 's');
    if (type === 'error') beam.style.setProperty('--beam-color', '#ff3e00');
    if (type === 'success') beam.style.setProperty('--beam-color', '#00f2ff');
    wrapper.appendChild(beam); elementsToRemove.push(beam);
    const dotCount = type === 'neutral' ? 0 : 8;
    for (let i = 0; i < dotCount; i++) {
        const dot = document.createElement('div'); dot.className = 'glow-dot';
        dot.style.left = (Math.random() * 90 + 5) + '%'; dot.style.top = (Math.random() * 90 + 5) + '%';
        dot.style.setProperty('--dot-color', type === 'error' ? '#ff3e00' : '#00f2ff');
        dot.style.setProperty('--dot-dur', (0.2 + Math.random() * 0.3) + 's');
        wrapper.appendChild(dot); elementsToRemove.push(dot);
    }
    setTimeout(() => {
        wrapper.classList.remove(glitchClass, 'glitch-intense', jitterClass);
        if (scanline) scanline.classList.remove('scanline-error', 'scanline-flicker');
        elementsToRemove.forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); });
    }, duration);
}

function setFeedback(msg, shouldShake) {
    const feedback = document.getElementById('feedback-msg');
    if (!feedback) return;
    feedback.innerHTML = msg;
    if (shouldShake) {
        const wrapper = document.querySelector('.main-wrapper');
        if (wrapper) { wrapper.classList.remove('shake'); void wrapper.offsetWidth; wrapper.classList.add('shake'); }
    }
}

// Keyboard: Enter to guess (solo & duel)
document.addEventListener('keypress', (e) => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('page-game').classList.contains('active')) checkGuess();
    else if (document.getElementById('duel-arena').style.display === 'block' && !duel.done) submitDuelGuess();
});
