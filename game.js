// Supabase Configuration
const SUPABASE_URL = 'https://pfzdtwvsghdwchrmogap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmemR0d3ZzZ2hkd2Nocm1vZ2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM1MzgsImV4cCI6MjA4NjM3OTUzOH0.dfD5GF7luaWCJ_nL-kjMIh51D143fw93mbgsIDYutUQ';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ============================================================
// GAME STATE
// ============================================================
let gameState = {
    targetNumber: 0,
    maxLives: 0,
    currentLives: 0,
    minRange: 1,
    maxRange: 100,
    history: [],
    difficulty: '',
    currentUser: null,
    mode: 'solo',          // 'solo' or 'duel'
    startTime: 0,
    timerInterval: null,
    wrongGuesses: 0,
};

// ============================================================
// CUSTOM AUTH - No Supabase Auth, uses users table + SHA-256
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
        if (error || !data) {
            setFeedback("> DATA SALAH", true); triggerFlash('flash-red');
            loginBtn.disabled = false; loginBtn.innerText = "LOGIN"; return;
        }
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
            profile.style.display = 'flex'; display.innerText = gameState.currentUser.toUpperCase();
            logoutBtn.style.display = 'block'; authActions.style.display = 'none';
        } else {
            profile.style.display = 'flex'; display.innerText = "GUEST";
            logoutBtn.style.display = 'none'; authActions.style.display = 'flex';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => { userAuth.checkSession(); });

// ============================================================
// DIFFICULTIES & PAGE MANAGEMENT
// ============================================================
const difficulties = {
    easy: { max: 10, lives: 5 },
    medium: { max: 50, lives: 7 },
    hard: { max: 100, lives: 10 }
};

const pages = ['page-menu', 'page-difficulty', 'page-game', 'page-result', 'page-leaderboard', 'page-login', 'page-register'];
const inputField = document.getElementById('guess-input');
const backBtn = document.getElementById('back-btn');

function showPage(pageId, isPopState = false) {
    // Hide duel arena when navigating solo pages
    document.getElementById('duel-arena').style.display = 'none';
    document.getElementById('main-wrapper-solo').style.display = '';

    pages.forEach(id => {
        const el = document.getElementById(id);
        if (id === pageId) el.classList.add('active');
        else el.classList.remove('active');
    });

    if (!isPopState) history.pushState({ pageId }, '', '#' + pageId);

    if (pageId === 'page-menu' || pageId === 'page-result') backBtn.classList.remove('visible');
    else backBtn.classList.add('visible');

    triggerGlobalGlitch();

    if (pageId === 'page-game') {
        inputField.value = ''; inputField.focus();
        document.getElementById('feedback-msg').innerText = '';
    }
}

window.onpopstate = (e) => { showPage(e.state ? e.state.pageId : 'page-menu', true); };
function goBack() { history.back(); }

// ============================================================
// MODE SELECTION
// ============================================================
function selectMode(mode) {
    gameState.mode = mode;
    if (mode === 'solo') {
        showPage('page-difficulty');
    } else {
        // For duel, show difficulty inside solo wrapper first
        document.getElementById('diff-subtitle').innerHTML = '&gt; PILIH_LEVEL_DUEL';
        showPage('page-difficulty');
    }
}

// ============================================================
// STOPWATCH
// ============================================================
function startTimer(displayId) {
    const display = document.getElementById(displayId);
    const start = Date.now();
    return {
        startTime: start,
        interval: setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
            const tenths = Math.floor((elapsed * 10) % 10);
            display.innerText = `${mins}:${secs}.${tenths}`;
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
// POINTS CALCULATION
// ============================================================
function calcPoints(timeSec, wrongCount) {
    const BASE = 1000;
    const timePen = Math.min(Math.round(timeSec * 4), 600);
    const wrongPen = wrongCount * 80;
    return Math.max(50, BASE - timePen - wrongPen);
}

// ============================================================
// SOLO GAME
// ============================================================
let soloTimer = null;

function startGame(level) {
    const config = difficulties[level];

    if (gameState.mode === 'duel') {
        startDuelGame(level);
        return;
    }

    // Preserve currentUser
    const user = gameState.currentUser;
    gameState = {
        difficulty: level,
        maxRange: config.max,
        minRange: 1,
        maxLives: config.lives,
        currentLives: config.lives,
        targetNumber: Math.floor(Math.random() * config.max) + 1,
        history: [],
        currentUser: user,
        mode: 'solo',
        wrongGuesses: 0,
    };

    updateStatsUI();
    renderHearts('hearts-container', config.lives);
    document.getElementById('history-list').innerHTML = '';
    document.getElementById('stopwatch').innerText = '00:00.0';
    showPage('page-game');

    // Start timer
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
        const sp = calcPoints(elapsed, gameState.wrongGuesses);
        triggerFlash('flash-cyan'); triggerGlobalGlitch(400, 'success');
        showSoloResult(true, elapsed, sp);
    } else {
        gameState.currentLives--;
        gameState.wrongGuesses++;
        updateHeartsUI('hearts-container', gameState.currentLives, gameState.maxLives);
        triggerFlash('flash-red'); triggerGlobalGlitch(250, 'error');

        if (gameState.currentLives <= 0) {
            const elapsed = stopTimer(soloTimer);
            showSoloResult(false, elapsed, 0);
        } else {
            let hint = "";
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

function updateHeartsUI(containerId, current, max) {
    const hearts = document.querySelectorAll(`#${containerId} .heart`);
    if (hearts[current]) hearts[current].classList.add('lost');
}

function updateHistoryUI(guess, listId) {
    const list = document.getElementById(listId);
    const tag = document.createElement('span');
    tag.className = 'hist-tag';
    tag.innerText = `[${guess}]`;
    list.prepend(tag);
}

function showSoloResult(isWin, timeSec, points) {
    const content = document.getElementById('result-content');
    const statusText = isWin ? 'BERHASIL' : 'GAGAL';
    const subText = isWin
        ? `Kamu hebat! Angkanya adalah: ${gameState.targetNumber}`
        : `Sayang sekali. Angkanya adalah: ${gameState.targetNumber}`;

    let extraInfo = "";
    if (isWin) {
        const attempts = gameState.history.length;
        const timeStr = formatTime(timeSec);
        const pointsDisplay = `<div class="win-text-small" style="font-size: 1.5rem; color: var(--neon-magenta); margin: 0.5rem 0;">${points} SP</div>`;
        const statsDisplay = `<div class="win-text-small">${attempts} tebakan · ${timeStr} · ${gameState.wrongGuesses} salah</div>`;

        if (gameState.currentUser) {
            extraInfo = `
                ${pointsDisplay}${statsDisplay}
                <div class="name-entry-area">
                    <input type="text" id="player-name" value="${gameState.currentUser.toUpperCase()}" placeholder="MASUKKAN NAMA" maxlength="10">
                    <button class="btn btn-primary" id="save-score-btn" onclick="handleSaveScore(${Math.round(timeSec)}, ${points})">SIMPAN REKOR</button>
                </div>`;
        } else {
            extraInfo = `
                ${pointsDisplay}${statsDisplay}
                <div class="guest-notice">
                    <p>&gt; DAFTAR_LOGIN_UNTUK_SIMPAN_SKOR</p>
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <button class="btn btn-outline" style="font-size: 0.7rem; padding: 0.5rem;" onclick="showPage('page-login')">LOGIN</button>
                        <button class="btn btn-outline" style="font-size: 0.7rem; padding: 0.5rem;" onclick="showPage('page-register')">BUAT AKUN</button>
                    </div>
                </div>`;
        }
    }

    content.innerHTML = `
        <div class="result-status ${isWin ? 'win-color' : 'lose-color'}">${isWin ? 'MENANG' : 'KALAH'}</div>
        <h1 style="-webkit-text-fill-color: initial; color: #fff;">${statusText}</h1>
        <p class="subtitle" style="color: var(--text-dim)">&gt; ${subText}</p>
        ${extraInfo}`;
    showPage('page-result');
}

// ============================================================
// DUEL GAME
// ============================================================
let duelState = { p1: null, p2: null, timer1: null, timer2: null, difficulty: '', finished: 0 };

function startDuelGame(level) {
    const config = difficulties[level];

    // Generate two DIFFERENT target numbers
    const target1 = Math.floor(Math.random() * config.max) + 1;
    let target2 = Math.floor(Math.random() * config.max) + 1;
    while (target2 === target1) {
        target2 = Math.floor(Math.random() * config.max) + 1;
    }

    duelState = {
        difficulty: level,
        finished: 0,
        finishOrder: [],
        p1: {
            target: target1, lives: config.lives, maxLives: config.lives,
            min: 1, max: config.max, history: [], wrong: 0, done: false, won: false,
            timeSec: 0, points: 0
        },
        p2: {
            target: target2, lives: config.lives, maxLives: config.lives,
            min: 1, max: config.max, history: [], wrong: 0, done: false, won: false,
            timeSec: 0, points: 0
        },
        timer1: null, timer2: null,
    };

    // Setup UI
    document.getElementById('main-wrapper-solo').style.display = 'none';
    const arena = document.getElementById('duel-arena');
    arena.style.display = 'block';

    // Reset panels
    ['duel-p1', 'duel-p2'].forEach(id => {
        document.getElementById(id).classList.remove('finished', 'winner');
    });

    // Render hearts
    renderHearts('hearts-p1', config.lives);
    renderHearts('hearts-p2', config.lives);

    // Reset stats
    document.getElementById('low-p1').innerText = 1;
    document.getElementById('high-p1').innerText = config.max;
    document.getElementById('low-p2').innerText = 1;
    document.getElementById('high-p2').innerText = config.max;

    // Reset inputs and feedback
    document.getElementById('guess-p1').value = '';
    document.getElementById('guess-p2').value = '';
    document.getElementById('feedback-p1').innerText = '';
    document.getElementById('feedback-p2').innerText = '';
    document.getElementById('history-p1').innerHTML = '';
    document.getElementById('history-p2').innerHTML = '';
    document.getElementById('stopwatch-p1').innerText = '00:00.0';
    document.getElementById('stopwatch-p2').innerText = '00:00.0';

    // Start timers
    duelState.timer1 = startTimer('stopwatch-p1');
    duelState.timer2 = startTimer('stopwatch-p2');

    // Hide solo pages
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    console.log(`[DUEL] P1 Target: ${target1}, P2 Target: ${target2}`);
}

function checkDuelGuess(player) {
    const p = player === 1 ? duelState.p1 : duelState.p2;
    const inputId = player === 1 ? 'guess-p1' : 'guess-p2';
    const feedbackId = player === 1 ? 'feedback-p1' : 'feedback-p2';
    const heartsId = player === 1 ? 'hearts-p1' : 'hearts-p2';
    const historyId = player === 1 ? 'history-p1' : 'history-p2';
    const lowId = player === 1 ? 'low-p1' : 'low-p2';
    const highId = player === 1 ? 'high-p1' : 'high-p2';
    const panelId = player === 1 ? 'duel-p1' : 'duel-p2';
    const timerObj = player === 1 ? duelState.timer1 : duelState.timer2;

    if (p.done) return;

    const input = document.getElementById(inputId);
    const guess = parseInt(input.value);

    if (isNaN(guess) || guess < p.min || guess > p.max) {
        triggerFlash('flash-red');
        document.getElementById(feedbackId).innerHTML = "ANGKA_LUAR_BATAS";
        return;
    }

    p.history.push(guess);
    updateHistoryUI(guess, historyId);

    if (guess === p.target) {
        // WIN
        p.done = true;
        p.won = true;
        p.timeSec = stopTimer(timerObj);
        p.points = calcPoints(p.timeSec, p.wrong);
        duelState.finished++;
        duelState.finishOrder.push(player);

        document.getElementById(feedbackId).innerHTML = `✓ BENAR! ${p.points} DP`;
        document.getElementById(panelId).classList.add('finished', 'winner');
        triggerFlash('flash-cyan');

        if (duelState.finished >= 2) showDuelResult();
    } else {
        p.lives--;
        p.wrong++;
        updateHeartsUI(heartsId, p.lives, p.maxLives);
        triggerFlash('flash-red');

        if (p.lives <= 0) {
            p.done = true;
            p.won = false;
            p.timeSec = stopTimer(timerObj);
            p.points = 0;
            duelState.finished++;
            duelState.finishOrder.push(player);

            document.getElementById(feedbackId).innerHTML = `✗ KALAH! Angka: ${p.target}`;
            document.getElementById(panelId).classList.add('finished');

            if (duelState.finished >= 2) showDuelResult();
        } else {
            if (guess < p.target) {
                p.min = Math.max(p.min, guess + 1);
                document.getElementById(feedbackId).innerHTML = `&gt; RENDAH: ${p.min}-${p.max}`;
            } else {
                p.max = Math.min(p.max, guess - 1);
                document.getElementById(feedbackId).innerHTML = `&gt; TINGGI: ${p.min}-${p.max}`;
            }
            document.getElementById(lowId).innerText = p.min;
            document.getElementById(highId).innerText = p.max;
            input.value = '';
            input.focus();
        }
    }
}

function showDuelResult() {
    // Stop any remaining timers
    stopTimer(duelState.timer1);
    stopTimer(duelState.timer2);

    const p1 = duelState.p1;
    const p2 = duelState.p2;

    let winner = '';
    if (p1.won && p2.won) {
        // Both won — first to finish wins
        winner = duelState.finishOrder[0] === 1 ? 'PLAYER 1' : 'PLAYER 2';
    } else if (p1.won) {
        winner = 'PLAYER 1';
    } else if (p2.won) {
        winner = 'PLAYER 2';
    } else {
        winner = 'TIDAK ADA';
    }

    const content = document.getElementById('duel-result-content');
    content.innerHTML = `
        <div class="result-status win-color">DUEL SELESAI</div>
        <h1 style="-webkit-text-fill-color: initial; color: #fff;">PEMENANG: ${winner}</h1>
        <div style="display:flex; gap:1rem; margin-top:1.5rem; justify-content:center; flex-wrap:wrap;">
            <div style="flex:1; min-width:180px; padding:1rem; border:1px solid rgba(255,255,255,0.1); background:rgba(0,242,255,0.03);">
                <div class="duel-player-label">PLAYER 1</div>
                <div style="font-size:1.5rem; font-weight:700; color:var(--neon-magenta); font-family:var(--font-data);">${p1.won ? p1.points + ' DP' : 'KALAH'}</div>
                <div class="win-text-small">${p1.history.length} tebakan · ${formatTime(p1.timeSec)} · ${p1.wrong} salah</div>
            </div>
            <div style="flex:1; min-width:180px; padding:1rem; border:1px solid rgba(255,255,255,0.1); background:rgba(0,242,255,0.03);">
                <div class="duel-player-label">PLAYER 2</div>
                <div style="font-size:1.5rem; font-weight:700; color:var(--neon-magenta); font-family:var(--font-data);">${p2.won ? p2.points + ' DP' : 'KALAH'}</div>
                <div class="win-text-small">${p2.history.length} tebakan · ${formatTime(p2.timeSec)} · ${p2.wrong} salah</div>
            </div>
        </div>`;

    document.getElementById('duel-result-overlay').style.display = 'flex';
    triggerGlobalGlitch(400, 'success');
}

function exitDuel() {
    stopTimer(duelState.timer1);
    stopTimer(duelState.timer2);
    document.getElementById('duel-arena').style.display = 'none';
    document.getElementById('duel-result-overlay').style.display = 'none';
    document.getElementById('main-wrapper-solo').style.display = '';
}

// ============================================================
// SCORE SAVING (supports mode + points + time)
// ============================================================
async function saveScore(difficulty, attempts, name, mode, points, timeSec) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from('scores').insert([{
        username: name,
        difficulty: difficulty,
        attempts: attempts,
        mode: mode || 'solo',
        points: points || 0,
        time_seconds: timeSec || 0
    }]);
    if (error) console.error("Error saving score:", error);
}

async function handleSaveScore(timeSec, points) {
    const nameInput = document.getElementById('player-name');
    const saveBtn = document.getElementById('save-score-btn');
    const name = nameInput.value.trim().toUpperCase() || "PLAYER";
    const attempts = gameState.history.length;

    nameInput.disabled = true; saveBtn.disabled = true; saveBtn.innerText = "MENYIMPAN...";
    await saveScore(gameState.difficulty, attempts, name, 'solo', points, timeSec);
    saveBtn.innerText = "TERSIMPAN!";
    triggerGlobalGlitch(300, 'success');
}

// ============================================================
// LEADERBOARD (Split: Solo / Duel tabs)
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
    container.innerHTML = '<p class="subtitle" style="text-align:center; opacity:0.5; margin-top:2rem;">&gt; MENGAMBIL_DATA_DARI_CLOUD...</p>';

    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('scores')
        .select('*')
        .eq('mode', mode)
        .order('points', { ascending: false })
        .order('time_seconds', { ascending: true })
        .limit(10);

    if (error) {
        container.innerHTML = '<p class="subtitle" style="text-align:center; color:var(--accent-red);">GAGAL MENGHUBUNGI SERVER</p>';
        return;
    }

    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="subtitle" style="text-align:center; opacity:0.5; margin-top:2rem;">BELUM ADA REKOR</p>';
        return;
    }

    const pointLabel = mode === 'solo' ? 'SP' : 'DP';

    data.forEach((entry, index) => {
        const el = document.createElement('div');
        el.className = 'score-entry';
        el.style.animationDelay = `${index * 0.1}s`;
        const dateStr = new Date(entry.created_at).toLocaleDateString();
        el.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span class="rank-tag">#${index + 1}</span>
                <span class="player-name-tag">${(entry.username || 'USER').toUpperCase()}</span>
                <span class="diff-tag">${entry.difficulty.toUpperCase()}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span class="score-value">${entry.points || 0} ${pointLabel}</span>
                <span style="font-size: 0.6rem; color: var(--text-dim);">${dateStr}</span>
            </div>`;
        container.appendChild(el);
    });
}

// ============================================================
// GLITCH & EFFECTS (kept from previous implementation)
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

    if (type === 'error') {
        glitchClass = 'glitch-error';
        blockGradient = 'repeating-linear-gradient(90deg, #ff0000, #550000 50px)';
    } else if (type === 'success') {
        glitchClass = 'glitch-success';
        blockGradient = 'repeating-linear-gradient(90deg, #00f2ff, #ffffff 50px)';
    }

    wrapper.classList.add(glitchClass);
    if (type !== 'neutral') wrapper.classList.add('glitch-intense');

    if (scanline) {
        if (type === 'error') scanline.classList.add('scanline-error');
        else scanline.classList.add('scanline-flicker');
    }

    const jitterClass = type === 'success' ? 'wrapper-light-burst' : 'wrapper-jitter';
    wrapper.classList.remove(jitterClass);
    void wrapper.offsetWidth;
    wrapper.classList.add(jitterClass);

    const elementsToRemove = [];

    const streakCount = type === 'neutral' ? 1 : 3;
    for (let i = 0; i < streakCount; i++) {
        const streak = document.createElement('div');
        streak.className = 'neon-streak';
        streak.style.top = (Math.random() * 95 + 2) + '%';
        streak.style.setProperty('--streak-dur', (0.4 + Math.random() * 0.4) + 's');
        if (type === 'error') streak.style.background = 'linear-gradient(90deg, transparent, #ff3e00, #ff0000, transparent)';
        if (type === 'success') streak.style.background = 'linear-gradient(90deg, transparent, #00f2ff, #ffffff, transparent)';
        document.body.appendChild(streak);
        elementsToRemove.push(streak);
    }

    const blockCount = type === 'neutral' ? 2 : 6;
    for (let i = 0; i < blockCount; i++) {
        const b = document.createElement('div');
        b.className = 'signal-block';
        b.style.setProperty('--block-color', blockGradient);
        b.style.top = (Math.random() * 90) + '%';
        b.style.height = (Math.random() * 15 + 5) + '%';
        wrapper.appendChild(b);
        elementsToRemove.push(b);
    }

    const beam = document.createElement('div');
    beam.className = 'scan-beam';
    beam.style.setProperty('--beam-dur', (duration / 1000).toFixed(2) + 's');
    if (type === 'error') beam.style.setProperty('--beam-color', '#ff3e00');
    if (type === 'success') beam.style.setProperty('--beam-color', '#00f2ff');
    wrapper.appendChild(beam);
    elementsToRemove.push(beam);

    const dotCount = type === 'neutral' ? 0 : 8;
    for (let i = 0; i < dotCount; i++) {
        const dot = document.createElement('div');
        dot.className = 'glow-dot';
        dot.style.left = (Math.random() * 90 + 5) + '%';
        dot.style.top = (Math.random() * 90 + 5) + '%';
        dot.style.setProperty('--dot-color', type === 'error' ? '#ff3e00' : '#00f2ff');
        dot.style.setProperty('--dot-dur', (0.2 + Math.random() * 0.3) + 's');
        wrapper.appendChild(dot);
        elementsToRemove.push(dot);
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
        if (wrapper) {
            wrapper.classList.remove('shake');
            void wrapper.offsetWidth;
            wrapper.classList.add('shake');
        }
    }
}

// Keyboard: Enter to guess
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.getElementById('page-game').classList.contains('active')) {
        checkGuess();
    }
});
