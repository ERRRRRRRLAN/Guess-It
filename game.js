// Supabase Configuration
const SUPABASE_URL = 'https://tmysejqzjrbxcvmtsyup.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRteXNlanF6anJieGN2bXRzeXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODYwNTEsImV4cCI6MjA5MjQ2MjA1MX0.5Lb-FWveCGGWlFbB8Ku_rLET6ja07zmpXKWe9yG497k';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ============================================================
// GAME STATE
// ============================================================
let gameState = {
    maxLives: 0, currentLives: 0,
    minRange: 1, maxRange: 100, history: [],
    difficulty: '', currentUser: null, mode: 'solo',
    wrongGuesses: 0,
};

// Obfuscated Engine to hide targets from browser console
const GameEngine = (() => {
    let _soloTarget = 0;
    let _duelTarget = 0;
    return {
        setSoloTarget: (val) => { _soloTarget = val; },
        checkSoloGuess: (guess) => {
            if (guess === _soloTarget) return 0;
            return guess < _soloTarget ? -1 : 1;
        },
        getSoloTarget: () => _soloTarget,
        setDuelTarget: (val) => { _duelTarget = val; },
        checkDuelGuess: (guess) => {
            if (guess === _duelTarget) return 0;
            return guess < _duelTarget ? -1 : 1;
        },
        getDuelTarget: () => _duelTarget,
        saveDuelScore: async (difficulty, attempts, name, points, timeSec) => {
            if (!supabaseClient || !name) return;
            try {
                await supabaseClient.rpc('submit_score_secure', {
                    p_mode: 'duel',
                    p_difficulty: difficulty,
                    p_attempts: attempts,
                    p_points: points,
                    p_time_seconds: timeSec
                });
            } catch (e) {
                console.error('Score save error:', e);
            }
        }
    };
})();

const DEBUG_MODE = ['localhost', '127.0.0.1'].includes(window.location.hostname);

function escapeHtml(value) {
    const str = String(value ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clampInt(value, min, max, fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.round(n);
    return Math.min(max, Math.max(min, i));
}

const MODE_STORAGE_KEY = 'guess_it_mode';

function persistMode(mode) {
    try { sessionStorage.setItem(MODE_STORAGE_KEY, mode); } catch (_) {}
}

function readPersistedMode() {
    try { return sessionStorage.getItem(MODE_STORAGE_KEY); } catch (_) { return null; }
}

function applyModeToDifficultyUI(mode) {
    const subtitle = document.getElementById('diff-subtitle');
    if (!subtitle) return;
    subtitle.innerHTML = mode === 'duel' ? '&gt; PILIH_LEVEL_DUEL' : '&gt; PILIH_LEVEL';
}

function setMode(mode, { persist = true } = {}) {
    let nextMode = mode === 'duel' ? 'duel' : 'solo';
    if (nextMode === 'duel' && !gameState.currentUser) nextMode = 'solo';
    gameState.mode = nextMode;
    if (persist) persistMode(nextMode);
    applyModeToDifficultyUI(nextMode);
}

const MATCHMAKING_STORAGE_KEY = 'guess_it_matchmaking_state';
const DUEL_STORAGE_KEY = 'guess_it_duel_state';
const DUEL_STORAGE_TTL_MS = 1000 * 60 * 60; // 1 hour

function safeJsonParse(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
}

function persistMatchmakingState(state) {
    try { sessionStorage.setItem(MATCHMAKING_STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

function readMatchmakingState() {
    try { return safeJsonParse(sessionStorage.getItem(MATCHMAKING_STORAGE_KEY)); } catch (_) { return null; }
}

function clearMatchmakingState() {
    try { sessionStorage.removeItem(MATCHMAKING_STORAGE_KEY); } catch (_) {}
}

function duelStorageKeyForUser(username) {
    return `${DUEL_STORAGE_KEY}:${(username || '').toLowerCase()}`;
}

function writeDuelStorage(username, snapshot) {
    try { localStorage.setItem(duelStorageKeyForUser(username), JSON.stringify(snapshot)); } catch (_) {}
}

function readDuelStorage(username) {
    try { return safeJsonParse(localStorage.getItem(duelStorageKeyForUser(username))); } catch (_) { return null; }
}

function removeDuelStorage(username) {
    try { localStorage.removeItem(duelStorageKeyForUser(username)); } catch (_) {}
}

function persistDuelState() {
    if (!duel?.room?.id || !gameState.currentUser) return;

    const myTimerStartAt = duel.timer?.startTime || 0;
    const oppTimerStartAt = duel.oppTimerStart || 0;

    const snapshot = {
        v: 1,
        savedAt: Date.now(),
        roomId: duel.room.id,
        difficulty: duel.difficulty,
        myRole: duel.myRole,
        myTarget: duel.myTarget,
        oppName: duel.oppName,

        lives: duel.lives,
        maxLives: duel.maxLives,
        min: duel.min,
        max: duel.max,
        history: Array.isArray(duel.history) ? duel.history : [],
        wrong: duel.wrong,
        done: duel.done,
        won: duel.won,
        timeSec: duel.timeSec || 0,
        points: duel.points || 0,

        currentRound: duel.currentRound,
        myRoundWins: duel.myRoundWins,
        oppRoundWins: duel.oppRoundWins,
        roundResults: Array.isArray(duel.roundResults) ? duel.roundResults : [],
        roundOver: duel.roundOver,
        roundWon: duel.roundWon,
        oppRoundOver: duel.oppRoundOver,
        oppRoundWon: duel.oppRoundWon,

        graceTimeLeft: duel.graceTimeLeft,

        oppLives: duel.oppLives,
        oppMaxLives: duel.oppMaxLives,
        oppMin: duel.oppMin,
        oppMax: duel.oppMax,
        oppWrong: duel.oppWrong,
        oppDone: duel.oppDone,
        oppWon: duel.oppWon,
        oppHistory: Array.isArray(duel.oppHistory) ? duel.oppHistory : [],
        oppTimeSec: duel.oppTimeSec || 0,
        oppPoints: duel.oppPoints || 0,

        myTimerStartAt,
        oppTimerStartAt
    };

    writeDuelStorage(gameState.currentUser, snapshot);
}

function readDuelState() {
    if (!gameState.currentUser) return null;
    const saved = readDuelStorage(gameState.currentUser);
    if (!saved) return null;
    if (!saved.savedAt || (Date.now() - saved.savedAt) > DUEL_STORAGE_TTL_MS) {
        removeDuelStorage(gameState.currentUser);
        return null;
    }
    return saved;
}

function clearDuelState() {
    if (!gameState.currentUser) return;
    removeDuelStorage(gameState.currentUser);
}

// ============================================================
// CUSTOM AUTH
// ============================================================
const AUTH_EMAIL_DOMAIN = 'example.com';
const LEGACY_AUTH_EMAIL_DOMAINS = ['guessit.local'];
const USERNAME_REGEX = /^[a-z0-9_]{3,15}$/;
const LAST_USERNAME_KEY = 'guess_it_last_username';
const AUTH_SIGNUP_TIMEOUT_MS = 10000;
const AUTH_LOGIN_TIMEOUT_MS = 10000;
const REGISTER_LOGIN_RETRY_MS = [250, 500, 900];

let lastRegisteredCredentials = null;

let lastAuthAttempt = 0;
function isRateLimited() {
    const now = Date.now();
    if (now - lastAuthAttempt < 2000) return true;
    lastAuthAttempt = now;
    return false;
}

function normalizeUsernameInput(raw) {
    return String(raw || '').trim().toLowerCase();
}

function usernameToAuthEmail(username) {
    return `${username}@${AUTH_EMAIL_DOMAIN}`;
}

function usernameToAuthEmails(username) {
    const unique = new Set([AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS]);
    return Array.from(unique).map((domain) => `${username}@${domain}`);
}

function emailToUsername(email) {
    const value = String(email || '').toLowerCase();
    if (value.endsWith(`@${AUTH_EMAIL_DOMAIN}`)) return value.slice(0, value.indexOf('@'));
    return value.split('@')[0] || '';
}

function mapAuthErrorMessage(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (!msg) return '> LOGIN GAGAL';
    if (msg.includes('timeout')) return '> SERVER AUTH LAMBAT, COBA LAGI.';
    if (msg.includes('network') || msg.includes('failed to fetch')) return '> KONEKSI INTERNET TIDAK STABIL.';
    if (msg.includes('invalid login credentials')) return '> DATA SALAH';
    if (msg.includes('username already registered') || msg.includes('username sudah terdaftar')) return '> USERNAME SUDAH TERDAFTAR';
    if (msg.includes('user already registered')) return '> USERNAME SUDAH TERDAFTAR';
    if (msg.includes('signup is disabled')) return '> SIGNUP SEDANG DINONAKTIFKAN';
    return `> ERROR AUTH: ${String(error.message).toUpperCase()}`;
}

function setAuthFeedback(scope, msg, isError = true) {
    const id = scope === 'register' ? 'auth-feedback-register' : 'auth-feedback-login';
    const el = document.getElementById(id);
    if (!el) {
        setFeedback(msg || '', !!isError);
        return;
    }
    el.textContent = msg || '';
    el.style.color = isError ? 'var(--accent-red)' : 'var(--neon-cyan)';
}

async function apiRequest(path, method = 'GET', body = null, timeoutMs = AUTH_LOGIN_TIMEOUT_MS) {
    const promise = fetch(path, {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined
    }).then(async (res) => {
        let payload = {};
        try { payload = await res.json(); } catch (_) {}
        if (!res.ok) {
            const msg = payload?.error || payload?.message || `HTTP_${res.status}`;
            throw new Error(msg);
        }
        return payload;
    });
    return withTimeout(promise, timeoutMs, 'AUTH REQUEST TIMEOUT');
}

async function signInByUsernameAndPassword(username, password) {
    try {
        await apiRequest('/api/auth/login', 'POST', { username, password }, AUTH_LOGIN_TIMEOUT_MS);
        return { ok: true, error: null };
    } catch (error) {
        return { ok: false, error };
    }
}

function isAuthTimeoutError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('request timeout');
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAuthUsernameWithRetry(maxAttempts = 3, delayMs = 250) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const me = await apiRequest('/api/auth/me', 'GET', null, AUTH_LOGIN_TIMEOUT_MS);
            const resolved = normalizeUsernameInput(me?.username || '');
            if (resolved) return resolved;
        } catch (_) {}
        if (i < maxAttempts - 1) await wait(delayMs);
    }
    return null;
}

async function finalizeLoginStateFromSession(fallbackUsername) {
    // Show logged-in state immediately, then refine username from session/profile in background.
    gameState.currentUser = fallbackUsername || gameState.currentUser || null;
    if (gameState.currentUser) localStorage.setItem(LAST_USERNAME_KEY, gameState.currentUser);
    userAuth.updateUI();
    showPage('page-menu');
    triggerGlobalGlitch(300, 'success');

    try {
        if (supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.user) {
                const resolved = normalizeUsernameInput(session.user.user_metadata?.username || emailToUsername(session.user.email));
                if (resolved && resolved !== gameState.currentUser) {
                    gameState.currentUser = resolved;
                    localStorage.setItem(LAST_USERNAME_KEY, resolved);
                    userAuth.updateUI();
                }
            }
        }
    } catch (_) {}
}

async function ensureSignedInAfterRegister(username, password) {
    const plan = [
        { waitMs: 0, timeoutMs: 3500, includeLegacy: false },
        { waitMs: 200, timeoutMs: 3500, includeLegacy: false },
        { waitMs: 450, timeoutMs: 4000, includeLegacy: false },
        { waitMs: 800, timeoutMs: 5000, includeLegacy: true }
    ];
    let lastError = null;
    for (const step of plan) {
        if (step.waitMs > 0) await wait(step.waitMs);
        const result = await signInByUsernameAndPassword(username, password, {
            includeLegacy: step.includeLegacy,
            timeoutMs: step.timeoutMs
        });
        if (result.ok) return { ok: true, error: null };
        lastError = result.error;
        const msg = String(result.error?.message || '').toLowerCase();
        const retryable = msg.includes('timeout') || msg.includes('invalid login credentials') || msg.includes('network') || msg.includes('failed to fetch');
        if (!retryable) break;
    }
    return { ok: false, error: lastError || new Error('LOGIN GAGAL') };
}

function withTimeout(promise, timeoutMs, timeoutLabel = 'REQUEST TIMEOUT') {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutLabel)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

const userAuth = {
    register: async () => {
        if (!supabaseClient) { setFeedback("> SUPABASE CLIENT TIDAK TERSEDIA", true); return; }
        setAuthFeedback('register', '');
        if (isRateLimited()) { setFeedback("> TUNGGU SEBENTAR...", true); return; }
        const user = normalizeUsernameInput(document.getElementById('reg-user').value);
        const pass = document.getElementById('reg-pass').value.trim();
        if (!user || !pass) { setAuthFeedback('register', '> ISI SEMUA DATA', true); return; }
        if (!USERNAME_REGEX.test(user)) { setAuthFeedback('register', '> USERNAME: 3-15 (a-z, 0-9, _)', true); return; }
        if (pass.length < 6) { setAuthFeedback('register', '> PASSWORD MIN 6 KARAKTER', true); return; }
        const regBtn = document.querySelector('#page-register .btn-primary');
        if (!regBtn) { setAuthFeedback('register', '> TOMBOL REGISTER TIDAK DITEMUKAN', true); return; }
        regBtn.disabled = true; regBtn.innerText = "PROSES...";
        try {
            setAuthFeedback('register', '> MEMBUAT AKUN...', false);
            
            const email = usernameToAuthEmail(user);
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password: pass,
                options: {
                    data: { username: user }
                }
            });

            if (error) {
                const lower = String(error.message).toLowerCase();
                if (lower.includes('already registered')) {
                    setAuthFeedback('register', '> USERNAME SUDAH TERDAFTAR. SILAKAN LOGIN.', true);
                    return;
                }
                setAuthFeedback('register', mapAuthErrorMessage(error), true);
                return;
            }

            const loginUser = document.getElementById('login-user');
            const loginPass = document.getElementById('login-pass');
            if (loginUser) loginUser.value = user;
            if (loginPass) loginPass.value = pass;
            lastRegisteredCredentials = { username: user, password: pass, ts: Date.now() };

            setAuthFeedback('register', '> DAFTAR BERHASIL. MENGARAHKAN KE LOGIN...', false);
            showPage('page-login');
            setAuthFeedback('login', '> AKUN BERHASIL DIBUAT. LANJUT KLIK LOGIN.', false);
            loginPass?.focus();
        } catch (err) {
            const errMsg = String(err?.message || 'KONEKSI GAGAL').toUpperCase();
            setAuthFeedback('register', `> ERROR: ${errMsg}`, true);
        } finally {
            regBtn.disabled = false;
            regBtn.innerText = "BUAT AKUN";
        }
    },
    login: async () => {
        if (!supabaseClient) { setFeedback("> SUPABASE CLIENT TIDAK TERSEDIA", true); return; }
        setAuthFeedback('login', '');
        if (isRateLimited()) { setFeedback("> TUNGGU SEBENTAR...", true); return; }
        const user = normalizeUsernameInput(document.getElementById('login-user').value);
        const pass = document.getElementById('login-pass').value.trim();
        if (!user || !pass) { setAuthFeedback('login', '> ISI USERNAME & PASSWORD', true); return; }
        if (!USERNAME_REGEX.test(user)) { setAuthFeedback('login', '> FORMAT USERNAME TIDAK VALID', true); return; }
        const loginBtn = document.querySelector('#page-login .btn-primary');
        if (!loginBtn) { setAuthFeedback('login', '> TOMBOL LOGIN TIDAK DITEMUKAN', true); return; }
        loginBtn.disabled = true; loginBtn.innerText = "VERIFIKASI...";
        try {
            let error = null;
            let success = false;
            
            const emails = usernameToAuthEmails(user);
            for (const email of emails) {
                const { error: signInErr } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password: pass
                });
                if (!signInErr) {
                    success = true;
                    break;
                }
                error = signInErr;
            }

            if (!success) {
                setAuthFeedback('login', mapAuthErrorMessage(error), true);
                triggerFlash('flash-red');
                return;
            }

            lastRegisteredCredentials = null;
            setAuthFeedback('login', '> LOGIN BERHASIL', false);
            await finalizeLoginStateFromSession(user);
        } catch (err) {
            setAuthFeedback('login', `> ERROR: ${(err?.message || 'KONEKSI GAGAL').toUpperCase()}`, true);
            triggerFlash('flash-red');
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerText = "LOGIN";
        }
    },
    logout: async () => {
        try {
            if (supabaseClient) {
                await supabaseClient.auth.signOut();
            }
        } catch (err) {
            console.warn('[AUTH] signOut failed, forcing local logout:', err?.message || err);
        } finally {
            gameState.currentUser = null;
            localStorage.removeItem(LAST_USERNAME_KEY);
            clearMatchmakingState();
            clearDuelState();
            userAuth.updateUI();
            showPage('page-menu');
            triggerGlobalGlitch(300, 'error');
        }
    },
    checkSession: async () => {
        if (!supabaseClient) { gameState.currentUser = null; userAuth.updateUI(); return; }
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.user) {
                const resolved = normalizeUsernameInput(session.user.user_metadata?.username || emailToUsername(session.user.email));
                if (resolved) {
                    gameState.currentUser = resolved;
                    localStorage.setItem(LAST_USERNAME_KEY, resolved);
                }
            } else {
                gameState.currentUser = null;
            }
        } catch (err) {
            gameState.currentUser = null;
        }
        userAuth.updateUI();
    },
    updateUI: () => {
        const profile = document.getElementById('user-profile');
        const display = document.getElementById('display-username');
        const authActions = document.getElementById('auth-actions');
        const logoutBtn = document.querySelector('.logout-btn');
        const pointsDiv = document.getElementById('user-points');
        const duelBtn = document.getElementById('duel-btn');
        const duelLock = document.getElementById('duel-lock');
        const duelLoginMsg = document.getElementById('duel-login-msg');
        if (!profile || !display || !authActions || !logoutBtn || !pointsDiv || !duelBtn || !duelLock || !duelLoginMsg) return;
        if (gameState.currentUser) {
            profile.style.display = 'flex';
            display.innerText = gameState.currentUser.toUpperCase();
            logoutBtn.style.display = 'block'; authActions.style.display = 'none';
            pointsDiv.style.display = 'flex';
            loadUserPoints();
            // Unlock duel
            duelBtn.classList.remove('locked');
            duelLock.style.display = 'none';
            duelLoginMsg.style.display = 'none';
        } else {
            profile.style.display = 'flex';
            display.innerText = "GUEST";
            logoutBtn.style.display = 'none'; authActions.style.display = 'flex';
            pointsDiv.style.display = 'none';
            // Lock duel
            duelBtn.classList.add('locked');
            duelLock.style.display = 'inline';
            duelLoginMsg.style.display = 'block';
        }
    }
};

function initAuthEnterHandlers() {
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const regUser = document.getElementById('reg-user');
    const regPass = document.getElementById('reg-pass');

    const submitOnEnter = (event, submitFn, buttonSelector) => {
        if (event.key !== 'Enter' || event.repeat) return;
        event.preventDefault();
        const btn = document.querySelector(buttonSelector);
        if (btn?.disabled) return;
        submitFn();
    };

    loginUser?.addEventListener('keydown', (e) => submitOnEnter(e, userAuth.login, '#page-login .btn-primary'));
    loginPass?.addEventListener('keydown', (e) => submitOnEnter(e, userAuth.login, '#page-login .btn-primary'));
    regUser?.addEventListener('keydown', (e) => submitOnEnter(e, userAuth.register, '#page-register .btn-primary'));
    regPass?.addEventListener('keydown', (e) => submitOnEnter(e, userAuth.register, '#page-register .btn-primary'));
}

async function cancelStaleMatchmakingAndReturnToDuelDifficulty() {
    clearMatchmakingState();
    cleanupMatchmaking();

    if (!gameState.currentUser) {
        setMode('solo');
        showPage('page-menu');
        return;
    }

    if (supabaseClient) {
        await supabaseClient
            .from('matchmaking_queue')
            .delete()
            .eq('username', gameState.currentUser)
            .eq('status', 'waiting');
    }

    setMode('duel');
    showPage('page-difficulty');
}

async function tryResumeDuelFromStorage() {
    const saved = readDuelState();
    if (!saved || !saved.roomId) return false;
    if (!gameState.currentUser || !supabaseClient) { clearDuelState(); return false; }

    const { data: room, error } = await supabaseClient
        .from('duel_rooms')
        .select('*')
        .eq('id', saved.roomId)
        .maybeSingle();

    if (error || !room) { clearDuelState(); return false; }
    if (room.status !== 'active') { clearDuelState(); return false; }
    if (room.player1 !== gameState.currentUser && room.player2 !== gameState.currentUser) { clearDuelState(); return false; }

    setMode('duel');
    joinDuelRoom(room, saved);
    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    // Render safe guest state immediately so menu never looks "empty".
    gameState.currentUser = null;
    userAuth.updateUI();

    // No Supabase Auth listener: session handled via server-side cookie + /api/auth/me.
    initAuthEnterHandlers();
    initPresence();
    initBGM();

    window.addEventListener('pagehide', () => {
        if (duel?.channel && !duel.done) persistDuelState();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && duel?.channel && !duel.done) persistDuelState();
    });

    (async () => {
        await userAuth.checkSession().catch(() => {
            gameState.currentUser = null;
            userAuth.updateUI();
        });

        // 1) Try resume duel first (covers refresh during active match)
        const resumed = await tryResumeDuelFromStorage();
        if (resumed) return;

        // 2) If user refreshes while matchmaking, cancel it and return to duel difficulty
        const hash = window.location.hash.substring(1);
        const mm = readMatchmakingState();
        if (hash === 'page-matchmaking' || (mm && mm.username === gameState.currentUser)) {
            await cancelStaleMatchmakingAndReturnToDuelDifficulty();
            return;
        }

        // 3) Normal hash routing
        const validPages = ['page-menu', 'page-difficulty', 'page-game', 'page-result', 'page-leaderboard', 'page-login', 'page-register', 'page-matchmaking'];
        if (hash && validPages.includes(hash)) showPage(hash, true);
    })();
});

// ============================================================
// BACKGROUND MUSIC
// ============================================================
let bgmPlaying = false;

function initBGM() {
    const bgm = document.getElementById('bgm');
    bgm.volume = 0.3;

    // Attach hover sound to all buttons
    document.addEventListener('mouseover', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            playSFX('hover');
        }
    });

    // Auto-play on first user interaction (browser policy)
    const startBGM = () => {
        bgm.play().then(() => {
            bgmPlaying = true;
            document.getElementById('icon-sound-on').style.display = '';
            document.getElementById('icon-sound-off').style.display = 'none';
        }).catch(() => {});
        document.removeEventListener('click', startBGM);
    };
    document.addEventListener('click', startBGM);
}

function toggleBGM() {
    const bgm = document.getElementById('bgm');
    if (bgmPlaying) {
        bgm.pause();
        bgmPlaying = false;
        document.getElementById('icon-sound-on').style.display = 'none';
        document.getElementById('icon-sound-off').style.display = '';
    } else {
        bgm.play();
        bgmPlaying = true;
        document.getElementById('icon-sound-on').style.display = '';
        document.getElementById('icon-sound-off').style.display = 'none';
    }
}

// ============================================================
// SOUND EFFECTS
// ============================================================
const sfx = {
    hover: new Audio('hover.mp3'),
    pageOpen: new Audio('page-open.mp3'),
    pageBack: new Audio('page-back.mp3'),
    wrong: new Audio('error or wrong.mp3'),
    win: new Audio('win.mp3'),
    lose: new Audio('lose.mp3'),
};

// Set volume for all SFX
Object.values(sfx).forEach(a => { a.volume = 0.5; a.preload = 'auto'; });

function playSFX(name) {
    const sound = sfx[name];
    if (!sound) return;
    sound.currentTime = 0;
    sound.play().catch(() => {});
}
// ============================================================
let presenceChannel = null;
let realtimeConnected = false;

function initPresence() {
    if (!supabaseClient) return;

    presenceChannel = supabaseClient.channel('online-users', {
        config: { presence: { key: Math.random().toString(36).substr(2, 9) } }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const count = Object.keys(state).length;
            document.getElementById('online-count').innerText = count;
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                realtimeConnected = true;
                await presenceChannel.track({
                    user: gameState.currentUser || 'guest',
                    online_at: new Date().toISOString()
                });
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                realtimeConnected = false;
                const onlineCount = document.getElementById('online-count');
                if (onlineCount) onlineCount.innerText = '-';
            }
        });
}

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
    if (!isPopState) playSFX('pageOpen');
    document.getElementById('duel-arena').style.display = 'none';
    document.getElementById('main-wrapper-solo').style.display = '';
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) { if (id === pageId) el.classList.add('active'); else el.classList.remove('active'); }
    });
    if (pageId === 'page-difficulty') {
        const savedMode = readPersistedMode();
        if (savedMode === 'duel' || savedMode === 'solo') setMode(savedMode, { persist: false });
        else applyModeToDifficultyUI(gameState.mode);
    }
    if (!isPopState) history.pushState({ pageId }, '', '#' + pageId);
    if (pageId === 'page-menu' || pageId === 'page-result') backBtn.classList.remove('visible');
    else backBtn.classList.add('visible');
    triggerGlobalGlitch();
    if (pageId === 'page-game') { inputField.value = ''; inputField.focus(); document.getElementById('feedback-msg').innerText = ''; }
    if (pageId === 'page-menu' && gameState.currentUser) loadUserPoints();
}

window.onpopstate = (e) => {
    const target = e.state ? e.state.pageId : 'page-menu';
    playSFX('pageBack');
    cleanupActiveGame();
    
    // Cancel matchmaking if navigating away
    if (typeof matchmakingQueueId !== 'undefined' && (matchmakingQueueId || typeof matchmakingChannel !== 'undefined' || typeof matchmakingPollInterval !== 'undefined')) {
        if (gameState.currentUser && supabaseClient) {
            supabaseClient.from('matchmaking_queue').delete().eq('username', gameState.currentUser).eq('status', 'waiting').then();
        }
        if (typeof cleanupMatchmaking === 'function') cleanupMatchmaking();
    }
    
    showPage(target, true);
};

function goBack() {
    cleanupActiveGame();
    history.back();
}

function cleanupActiveGame() {
    // Stop solo timer if running
    if (soloTimer) {
        stopTimer(soloTimer);
        soloTimer = null;
    }
}

// ============================================================
// MODE SELECTION
// ============================================================
function selectMode(mode) {
    if (mode === 'solo') {
        setMode('solo');
        showPage('page-difficulty');
    } else {
        // Duel requires login
        if (!gameState.currentUser) {
            setFeedback("> LOGIN DULU UNTUK DUEL", true);
            triggerFlash('flash-red');
            return;
        }
        setMode('duel');
        showPage('page-difficulty');
    }

    persistDuelState();
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

function startTimerFromStartAt(displayId, startTimeMs) {
    const display = document.getElementById(displayId);
    const start = typeof startTimeMs === 'number' && startTimeMs > 0 ? startTimeMs : Date.now();
    return {
        startTime: start,
        interval: setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            display.innerText = formatTime(elapsed);
        }, 100)
    };
}

function startTimerWithOffset(displayId, elapsedSec = 0) {
    const display = document.getElementById(displayId);
    const start = Date.now() - Math.max(0, elapsedSec) * 1000;
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

async function startGame(level) {
    if (gameState.mode === 'duel') {
        enterMatchmaking(level);
        return;
    }

    const config = difficulties[level];
    const user = gameState.currentUser;
    gameState = {
        difficulty: level, maxRange: config.max, minRange: 1,
        maxLives: config.lives, currentLives: config.lives,
        history: [], currentUser: user, mode: 'solo', wrongGuesses: 0,
        sessionId: null, finalTarget: 0
    };
    
    updateStatsUI();
    renderHearts('hearts-container', config.lives);
    document.getElementById('history-list').innerHTML = '';
    document.getElementById('stopwatch').innerText = '00:00.0';
    showPage('page-game');

    if (user && supabaseClient) {
        inputField.disabled = true;
        setFeedback("MENGHUBUNGKAN KE SERVER...", false);
        const { data: sessionId, error } = await supabaseClient.rpc('start_solo_game', { p_difficulty: level });
        if (error || !sessionId) {
            setFeedback("> ERROR SERVER", true);
            return;
        }
        gameState.sessionId = sessionId;
        inputField.disabled = false;
        setFeedback("");
        inputField.focus();
    } else {
        GameEngine.setSoloTarget(Math.floor(Math.random() * config.max) + 1);
    }
    
    soloTimer = startTimer('stopwatch');
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

function setHearts(containerId, total, current) {
    renderHearts(containerId, total);
    const hearts = document.querySelectorAll(`#${containerId} .heart`);
    const safeCurrent = Math.max(0, Math.min(total, current));
    for (let i = safeCurrent; i < total; i++) {
        if (hearts[i]) hearts[i].classList.add('lost');
    }
}

function updateStatsUI() {
    document.getElementById('low-display').innerText = gameState.minRange;
    document.getElementById('high-display').innerText = gameState.maxRange;
}

async function checkGuess() {
    const guess = parseInt(inputField.value);
    if (isNaN(guess) || guess < gameState.minRange || guess > gameState.maxRange) {
        triggerFlash('flash-red'); setFeedback("ANGKA_LUAR_BATAS", true); return;
    }
    gameState.history.push(guess);
    updateHistoryUI(guess, 'history-list');

    if (gameState.sessionId) {
        // SERVER AUTHORITATIVE
        inputField.disabled = true;
        const { data: res, error } = await supabaseClient.rpc('submit_solo_guess', {
            p_session_id: gameState.sessionId,
            p_guess: guess
        });
        
        if (error || !res || res.error) {
            triggerFlash('flash-red'); setFeedback("ERROR KONEKSI SERVER", true);
            inputField.disabled = false;
            return;
        }

        if (res.status === 'correct') {
            stopTimer(soloTimer);
            triggerFlash('flash-cyan'); triggerGlobalGlitch(400, 'success');
            playSFX('win');
            gameState.finalTarget = guess;
            showSoloResult(true, res.timeSec, res.points);
        } else if (res.status === 'lose') {
            stopTimer(soloTimer);
            gameState.currentLives = 0; gameState.wrongGuesses++;
            updateHeartsUI('hearts-container', 0);
            triggerFlash('flash-red'); triggerGlobalGlitch(250, 'error');
            playSFX('lose');
            gameState.finalTarget = res.target;
            showSoloResult(false, res.timeSec || 0, 0);
        } else {
            inputField.disabled = false;
            gameState.currentLives = res.lives; gameState.wrongGuesses++;
            updateHeartsUI('hearts-container', gameState.currentLives);
            triggerFlash('flash-red'); triggerGlobalGlitch(250, 'error');
            playSFX('wrong');
            
            gameState.minRange = res.min;
            gameState.maxRange = res.max;
            let hint = res.status === 'too_low' 
                ? `&gt; TERLALU_RENDAH: TEBAK_${res.min}_KE_${res.max}`
                : `&gt; TERLALU_TINGGI: TEBAK_${res.min}_KE_${res.max}`;
            
            updateStatsUI(); setFeedback(hint, true);
            inputField.value = ''; inputField.focus();
        }
    } else {
        // LOCAL FALLBACK (GUEST)
        const checkRes = GameEngine.checkSoloGuess(guess);
        if (checkRes === 0) {
            const elapsed = stopTimer(soloTimer);
            const sp = calcPoints(elapsed, gameState.wrongGuesses, gameState.difficulty);
            triggerFlash('flash-cyan'); triggerGlobalGlitch(400, 'success');
            playSFX('win');
            gameState.finalTarget = GameEngine.getSoloTarget();
            showSoloResult(true, elapsed, sp);
        } else {
            gameState.currentLives--; gameState.wrongGuesses++;
            updateHeartsUI('hearts-container', gameState.currentLives);
            triggerFlash('flash-red'); triggerGlobalGlitch(250, 'error');
            if (gameState.currentLives <= 0) {
                const elapsed = stopTimer(soloTimer);
                playSFX('lose');
                gameState.finalTarget = GameEngine.getSoloTarget();
                showSoloResult(false, elapsed, 0);
            } else {
                playSFX('wrong');
                let hint;
                if (checkRes === -1) {
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
        ? `Kamu hebat! Angkanya adalah: ${gameState.finalTarget}`
        : `Sayang sekali. Angkanya adalah: ${gameState.finalTarget}`;
    let extraInfo = "";
    if (isWin) {
        const attempts = gameState.history.length;
        const timeStr = formatTime(timeSec);
        const pointsDisplay = `<div class="win-text-small" style="font-size:1.5rem; color:var(--neon-magenta); margin:0.5rem 0;">+${points} SP</div>`;
        const statsDisplay = `<div class="win-text-small">${attempts} tebakan - ${timeStr} - ${gameState.wrongGuesses} salah - x${difficulties[gameState.difficulty].multiplier}</div>`;
        if (gameState.currentUser) {
            extraInfo = `${pointsDisplay}${statsDisplay}
                <div class="win-text-small" style="color:var(--neon-cyan); margin-top:0.75rem;">&gt; POIN_DITAMBAHKAN_KE_TOTAL_SP</div>`;
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
// ONLINE DUEL - MATCHMAKING
// ============================================================
let matchmakingQueueId = null;
let matchmakingChannel = null;
let matchmakingPollInterval = null;

async function enterMatchmaking(difficulty) {
    if (!gameState.currentUser) { setFeedback("> LOGIN DULU", true); return; }
    if (!difficulty || !difficulties[difficulty]) {
        setMode('duel');
        setFeedback("> PILIH LEVEL DUEL", true);
        showPage('page-difficulty');
        return;
    }

    showPage('page-matchmaking');
    document.getElementById('matchmaking-diff-label').innerText = `LEVEL: ${difficulty.toUpperCase()}`;
    document.getElementById('matchmaking-status').innerHTML = '&gt; MENUNGGU_PLAYER_LAIN...';
    persistMatchmakingState({ username: gameState.currentUser, difficulty, startedAt: Date.now(), queueId: null });

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

    // 2. No match - enter queue and wait
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
    persistMatchmakingState({ username: gameState.currentUser, difficulty, startedAt: Date.now(), queueId: matchmakingQueueId });

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
        const { data: roomsAsP1 } = await supabaseClient
            .from('duel_rooms')
            .select('*')
            .eq('status', 'active')
            .eq('player1', gameState.currentUser)
            .order('created_at', { ascending: false })
            .limit(1);

        const { data: roomsAsP2 } = await supabaseClient
            .from('duel_rooms')
            .select('*')
            .eq('status', 'active')
            .eq('player2', gameState.currentUser)
            .order('created_at', { ascending: false })
            .limit(1);

        const candidate = (roomsAsP1 && roomsAsP1[0]) || (roomsAsP2 && roomsAsP2[0]);
        if (candidate) {
            // Cek umur room untuk menghindari ghost room yang stuck (misal > 3 menit)
            const roomAgeMs = Date.now() - new Date(candidate.created_at).getTime();
            if (roomAgeMs > 3 * 60 * 1000) {
                console.log('[MATCHMAKING] Menghapus ghost room lama yang sudah expired (> 3 menit)');
                await supabaseClient.from('duel_rooms').delete().eq('id', candidate.id);
                // Biarkan polling berlanjut mencari musuh baru
            } else {
                console.log('[MATCH FOUND via Poll]', candidate);
                cleanupMatchmaking();
                joinDuelRoom(candidate);
            }
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

    // Create room - opponent is player1 (they were waiting), we are player2
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
    if (gameState.currentUser) {
        if (matchmakingQueueId) await supabaseClient.from('matchmaking_queue').delete().eq('id', matchmakingQueueId);
        await supabaseClient.from('matchmaking_queue').delete().eq('username', gameState.currentUser).eq('status', 'waiting');
    }
    cleanupMatchmaking();
    setMode('duel');
    
    if (history.length > 1) {
        history.back();
    } else {
        history.replaceState({ pageId: 'page-difficulty' }, '', '#page-difficulty');
        showPage('page-difficulty', true);
    }
}

function cleanupMatchmaking() {
    matchmakingQueueId = null;
    if (matchmakingChannel) { supabaseClient.removeChannel(matchmakingChannel); matchmakingChannel = null; }
    if (matchmakingPollInterval) { clearInterval(matchmakingPollInterval); matchmakingPollInterval = null; }
    clearMatchmakingState();
}

// ============================================================
// ONLINE DUEL - GAME ROOM
// ============================================================
let duel = {
    room: null,
    myRole: null,       // 'player1' or 'player2'
    oppName: '',
    lives: 0, maxLives: 0, min: 1, max: 100,
    history: [], wrong: 0, done: false,
    timer: null,
    channel: null,
    // Round Management
    currentRound: 1,
    myRoundWins: 0,
    oppRoundWins: 0,
    roundResults: [], // { round: 1, winner: 'player1', myPoints: 500, oppPoints: 400 }
    roundOver: false, // My round status
    // Opponent state (for display)
    oppLives: 0, oppMaxLives: 0, oppMin: 1, oppMax: 100,
    oppWrong: 0, oppDone: false, oppWon: false,
    oppHistory: [], oppTimeSec: 0, oppPoints: 0,
    oppRoundOver: false,
    graceTimeLeft: 0,
    graceInterval: null,
    oppConnection: 'unknown', // 'online' | 'offline' | 'reconnecting' | 'unknown'
    oppOfflineDeadline: 0,
    oppOfflineInterval: null,
};

const DUEL_OFFLINE_GRACE_MS = 15000;

function setOpponentConnectionUI(state, secondsLeft = null) {
    const statusEl = document.getElementById('opp-status');
    const timerEl = document.getElementById('timer-opp');
    if (!statusEl || !timerEl) return;

    if (state === 'offline') {
        statusEl.innerHTML = `<span style="color:var(--accent-red); font-weight:900;">OFFLINE</span>`;
        timerEl.innerHTML = secondsLeft != null ? `RECONNECT DALAM: ${secondsLeft}s` : 'RECONNECT...';
        return;
    }

    if (state === 'reconnecting') {
        statusEl.innerHTML = `<span style="color:var(--neon-magenta); font-weight:900;">RECONNECTING...</span>`;
        timerEl.innerHTML = '';
        return;
    }

    // online/unknown -> keep existing match status if already set by gameplay
    timerEl.innerHTML = '';
    if (duel.oppRoundOver) return;
    if (duel.oppDone) return;
    statusEl.innerHTML = '<span>MENUNGGU TEBAKAN...</span>';
}

function clearOpponentOfflineCountdown() {
    if (duel.oppOfflineInterval) clearInterval(duel.oppOfflineInterval);
    duel.oppOfflineInterval = null;
    duel.oppOfflineDeadline = 0;
}

function startOpponentOfflineCountdown() {
    if (duel.done) return;
    if (duel.oppOfflineInterval) return;

    duel.oppOfflineDeadline = Date.now() + DUEL_OFFLINE_GRACE_MS;
    duel.oppConnection = 'offline';

    const tick = () => {
        const msLeft = duel.oppOfflineDeadline - Date.now();
        const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
        setOpponentConnectionUI('offline', secLeft);

        if (msLeft <= 0) {
            clearOpponentOfflineCountdown();
            if (!duel.done && duel.oppConnection === 'offline') {
                // Win by opponent disconnect timeout
                duel.done = true;
                showDuelResult(true);
            }
        }
    };

    tick();
    duel.oppOfflineInterval = setInterval(tick, 250);
}

function joinDuelRoom(room, restoreSnapshot = null) {
    if (document.getElementById('duel-arena').style.display === 'block') {
        if (duel && duel.room && duel.room.id === room.id) return;
    }

    const config = difficulties[room.difficulty];
    const isP1 = room.player1 === gameState.currentUser;
    const restore = restoreSnapshot && restoreSnapshot.roomId === room.id ? restoreSnapshot : null;

    duel = {
        room: room,
        myRole: isP1 ? 'player1' : 'player2',
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
        currentRound: 1,
        myRoundWins: 0,
        oppRoundWins: 0,
        roundResults: [],
        roundOver: false,
        oppRoundOver: false,
        graceTimeLeft: 0,
        graceInterval: null,
        oppConnection: 'unknown',
        oppOfflineDeadline: 0,
        oppOfflineInterval: null,
    };
    GameEngine.setDuelTarget(isP1 ? room.target1 : room.target2);


    if (restore && restore.difficulty === room.difficulty && restore.oppName === duel.oppName && restore.myRole === duel.myRole) {
        if (restore.myTarget) GameEngine.setDuelTarget(restore.myTarget);
        duel.lives = restore.lives ?? duel.lives;
        duel.maxLives = restore.maxLives ?? duel.maxLives;
        duel.min = restore.min ?? duel.min;
        duel.max = restore.max ?? duel.max;
        duel.history = Array.isArray(restore.history) ? restore.history : duel.history;
        duel.wrong = restore.wrong ?? duel.wrong;
        duel.done = !!restore.done;
        duel.won = !!restore.won;
        duel.timeSec = restore.timeSec ?? duel.timeSec;
        duel.points = restore.points ?? duel.points;

        duel.currentRound = restore.currentRound ?? duel.currentRound;
        duel.myRoundWins = restore.myRoundWins ?? duel.myRoundWins;
        duel.oppRoundWins = restore.oppRoundWins ?? duel.oppRoundWins;
        duel.roundResults = Array.isArray(restore.roundResults) ? restore.roundResults : duel.roundResults;
        duel.roundOver = !!restore.roundOver;
        duel.roundWon = !!restore.roundWon;
        duel.oppRoundOver = !!restore.oppRoundOver;
        duel.oppRoundWon = !!restore.oppRoundWon;
        duel.graceTimeLeft = restore.graceTimeLeft ?? duel.graceTimeLeft;

        duel.oppLives = restore.oppLives ?? duel.oppLives;
        duel.oppMaxLives = restore.oppMaxLives ?? duel.oppMaxLives;
        duel.oppMin = restore.oppMin ?? duel.oppMin;
        duel.oppMax = restore.oppMax ?? duel.oppMax;
        duel.oppWrong = restore.oppWrong ?? duel.oppWrong;
        duel.oppDone = !!restore.oppDone;
        duel.oppWon = !!restore.oppWon;
        duel.oppHistory = Array.isArray(restore.oppHistory) ? restore.oppHistory : duel.oppHistory;
        duel.oppTimeSec = restore.oppTimeSec ?? duel.oppTimeSec;
        duel.oppPoints = restore.oppPoints ?? duel.oppPoints;
        duel._restoreTimerStarts = {
            myTimerStartAt: restore.myTimerStartAt || 0,
            oppTimerStartAt: restore.oppTimerStartAt || 0
        };
    }

    // Setup UI
    document.getElementById('main-wrapper-solo').style.display = 'none';
    document.getElementById('duel-arena').style.display = 'block';
    pages.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });

    document.getElementById('duel-opponent-name').innerText = duel.oppName.toUpperCase();
    document.getElementById('opp-label').innerText = duel.oppName.toUpperCase();

    // Reset panels
    document.getElementById('duel-my').classList.remove('finished', 'winner');
    document.getElementById('duel-opp').classList.remove('finished', 'winner');

    clearOpponentOfflineCountdown();
    setHearts('hearts-my', config.lives, duel.lives);
    setHearts('hearts-opp', config.lives, duel.oppLives);

    document.getElementById('low-my').innerText = duel.min;
    document.getElementById('high-my').innerText = duel.max;
    document.getElementById('low-opp').innerText = duel.oppMin;
    document.getElementById('high-opp').innerText = duel.oppMax;

    document.getElementById('guess-my').value = '';
    document.getElementById('feedback-my').innerText = '';
    document.getElementById('feedback-opp').innerText = '';
    document.getElementById('history-my').innerHTML = '';
    document.getElementById('history-opp').innerHTML = '';
    const now = Date.now();
    const myStartAt = duel._restoreTimerStarts?.myTimerStartAt || 0;
    const oppStartAt = duel._restoreTimerStarts?.oppTimerStartAt || 0;
    document.getElementById('stopwatch-my').innerText = myStartAt ? formatTime((now - myStartAt) / 1000) : '00:00.0';
    document.getElementById('stopwatch-opp').innerText = oppStartAt ? formatTime((now - oppStartAt) / 1000) : '00:00.0';
    if (duel.roundOver) document.getElementById('stopwatch-my').innerText = formatTime(duel.timeSec || 0);
    if (duel.oppRoundOver) document.getElementById('stopwatch-opp').innerText = formatTime(duel.oppTimeSec || 0);
    document.getElementById('duel-round-status').innerText = `ROUND ${duel.currentRound || 1}`;
    setOpponentConnectionUI('online');
    
    // Clear pips
    document.querySelectorAll('.pip').forEach(p => p.className = 'pip');
    for (let i = 0; i < duel.myRoundWins; i++) document.querySelectorAll('#pips-my .pip')[i]?.classList.add('won');
    for (let i = 0; i < duel.oppRoundWins; i++) document.querySelectorAll('#pips-opp .pip')[i]?.classList.add('won');

    // Restore history UI if resuming
    if (Array.isArray(duel.history)) duel.history.forEach(g => updateHistoryUI(g, 'history-my'));
    if (Array.isArray(duel.oppHistory)) duel.oppHistory.forEach(g => updateHistoryUI(g, 'history-opp'));

    // Start my timer
    if (!duel.roundOver && !duel.done) {
        duel.timer = myStartAt ? startTimerFromStartAt('stopwatch-my', myStartAt) : startTimer('stopwatch-my');
    }
    // Start opponent display timer
    duel.oppTimerStart = oppStartAt || Date.now();
    duel.oppTimerInterval = setInterval(() => {
        if (!duel.oppDone && !duel.oppRoundOver) {
            const elapsed = (Date.now() - duel.oppTimerStart) / 1000;
            document.getElementById('stopwatch-opp').innerText = formatTime(elapsed);
        }
    }, 100);

    // Subscribe to Realtime broadcast channel for this room
    const channelName = `duel-room-${room.id}`;
    duel.channel = supabaseClient.channel(channelName, {
        config: { presence: { key: gameState.currentUser } }
    })
        .on('presence', { event: 'sync' }, () => {
            const state = duel.channel.presenceState();
            let oppOnline = false;
            for (const key in state) {
                if (key.toLowerCase() === duel.oppName.toLowerCase() && state[key].length > 0) {
                    oppOnline = true;
                    break;
                }
            }
            if (!oppOnline) {
                startOpponentOfflineCountdown();
            } else {
                if (duel.oppConnection === 'offline') {
                    clearOpponentOfflineCountdown();
                    duel.oppConnection = 'reconnecting';
                    setOpponentConnectionUI('reconnecting');
                    setTimeout(() => {
                        duel.oppConnection = 'online';
                        setOpponentConnectionUI('online');
                    }, 800);
                } else {
                    duel.oppConnection = 'online';
                    setOpponentConnectionUI('online');
                }
            }
        })
        .on('broadcast', { event: 'guess' }, (payload) => {
            // Fallback: Jika menerima pesan broadcast dari lawan, berarti dia ONLINE
            if (duel.oppConnection !== 'online') {
                clearOpponentOfflineCountdown();
                duel.oppConnection = 'online';
                setOpponentConnectionUI('online');
            }
            handleOpponentBroadcast(payload.payload);
        })
        .subscribe(async (status, err) => {
            console.log('[REALTIME] Status Subscription:', status, err || '');
            if (status === 'SUBSCRIBED') {
                try {
                    await duel.channel.track({ user: gameState.currentUser, online_at: new Date().toISOString() });
                    console.log('[REALTIME] Presence tracked untuk:', gameState.currentUser);
                } catch (e) {
                    console.error('[REALTIME] Gagal track presence:', e);
                }
            }
        });

    console.log(`[DUEL JOINED] Room: ${room.id}, I am ${duel.myRole}, opponent: ${duel.oppName}`);
    delete duel._restoreTimerStarts;
    persistDuelState();
}

function submitDuelGuess() {
    if (duel.done || duel.roundOver) return;

    const input = document.getElementById('guess-my');
    const guess = parseInt(input.value);

    if (isNaN(guess) || guess < duel.min || guess > duel.max) {
        triggerFlash('flash-red');
        document.getElementById('feedback-my').innerHTML = 'ANGKA_LUAR_BATAS';
        return;
    }

    duel.history.push(guess);
    updateHistoryUI(guess, 'history-my');
    persistDuelState();

    const checkRes = GameEngine.checkDuelGuess(guess);
    if (checkRes === 0) {
        // ROUND WIN (Success)
        duel.roundOver = true;
        duel.roundWon = true; 
        duel.timeSec = stopTimer(duel.timer);
        duel.points = calcPoints(duel.timeSec, duel.wrong, duel.difficulty);
        
        if (duel.graceInterval) {
            clearInterval(duel.graceInterval);
            duel.graceInterval = null;
        }
        
        document.getElementById('timer-my').innerHTML = ''; // Clear grace timer msg

        document.getElementById('feedback-my').innerHTML = `SELESAI! ${duel.points} DP`;
        document.getElementById('duel-my').classList.add('finished');
        triggerFlash('flash-cyan');
        playSFX('win');

        // Broadcast to opponent
        broadcastGuessResult({ 
            round_finished: true, 
            won: true, 
            timeSec: duel.timeSec, 
            points: duel.points, 
            wrong: duel.wrong, 
            totalGuesses: duel.history.length 
        });

        if (duel.oppRoundOver) finishRound();
        persistDuelState();
    } else {
        duel.lives--;
        duel.wrong++;
        updateHeartsUI('hearts-my', duel.lives);
        triggerFlash('flash-red');
        
        if (duel.lives <= 0) {
            // ROUND LOSS (Out of lives)
            const elapsed = stopTimer(duel.timer);
            duel.timeSec = elapsed;
            duel.roundOver = true;
            duel.roundWon = false;
            duel.points = 0;
            
            document.getElementById('feedback-my').innerHTML = `GAGAL! NYAWA HABIS`;
            document.getElementById('duel-my').classList.add('finished');
            playSFX('lose');

            broadcastGuessResult({
                round_finished: true,
                won: false,
                timeSec: elapsed,
                points: 0,
                wrong: duel.wrong,
                totalGuesses: duel.history.length
            });
            if (duel.oppRoundOver) finishRound();
            persistDuelState();
            return;
        }

        playSFX('wrong');
        let feedbackText;
        if (checkRes === -1) {
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

        // Broadcast range/lives update (still playing)
        broadcastGuessResult({
            won: false, still_playing: true,
            lives: duel.lives,
            min: duel.min, max: duel.max,
            wrong: duel.wrong, totalGuesses: duel.history.length,
            lastGuess: guess
        });
        persistDuelState();
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

function normalizeOpponentPayload(rawData) {
    if (!rawData || typeof rawData !== 'object') return null;
    const sender = String(rawData.sender || '');
    if (!sender || sender !== duel.oppName) return null;

    if (rawData.forfeit === true) {
        return { sender, forfeit: true };
    }

    const rangeMax = difficulties[duel.difficulty]?.max || 100;
    if (rawData.next_round_sync === true) {
        return {
            sender,
            next_round_sync: true,
            target1: clampInt(rawData.target1, 1, rangeMax, 1),
            target2: clampInt(rawData.target2, 1, rangeMax, 1)
        };
    }

    const safeMin = clampInt(rawData.min, 1, rangeMax, 1);
    const safeMax = clampInt(rawData.max, 1, rangeMax, rangeMax);
    const min = Math.min(safeMin, safeMax);
    const max = Math.max(safeMin, safeMax);

    return {
        sender,
        round_finished: rawData.round_finished === true,
        still_playing: rawData.still_playing === true,
        won: rawData.won === true,
        lives: clampInt(rawData.lives, 0, duel.maxLives || 10, duel.maxLives || 10),
        wrong: clampInt(rawData.wrong, 0, duel.maxLives || 10, 0),
        totalGuesses: clampInt(rawData.totalGuesses, 0, 999, 0),
        timeSec: clampInt(rawData.timeSec, 0, 36000, 0),
        points: clampInt(rawData.points, 0, 5000, 0),
        min,
        max,
        lastGuess: rawData.lastGuess == null ? null : clampInt(rawData.lastGuess, 1, rangeMax, 1)
    };
}

function handleOpponentBroadcast(data) {
    const safeData = normalizeOpponentPayload(data);
    if (!safeData || safeData.sender === gameState.currentUser) return;

    if (safeData.forfeit) {
        duel.done = true;
        duel.roundOver = true;
        duel.oppRoundOver = true;
        clearInterval(duel.oppTimerInterval);
        document.getElementById('feedback-opp').innerText = 'MENYERAH';
        document.getElementById('duel-opp').classList.add('finished');
        document.getElementById('opp-status').innerHTML = '<span>MENYERAH</span>';
        playSFX('win');
        showDuelResult(true);
        persistDuelState();
        return;
    }

    if (safeData.next_round_sync) {
        GameEngine.setDuelTarget(duel.myRole === 'player1' ? safeData.target1 : safeData.target2);
        duel.oppTarget = duel.myRole === 'player1' ? safeData.target2 : safeData.target1;
        startNextRound();
        persistDuelState();
        return;
    }

    if (safeData.round_finished) {
        duel.oppRoundOver = true;
        duel.oppRoundWon = safeData.won;
        duel.oppTimeSec = safeData.timeSec;
        duel.oppPoints = safeData.points;
        duel.oppWrong = safeData.wrong;
        clearInterval(duel.oppTimerInterval);
        document.getElementById('stopwatch-opp').innerText = formatTime(safeData.timeSec);
        document.getElementById('feedback-opp').innerText = `SELESAI! ${safeData.points} DP`;
        document.getElementById('duel-opp').classList.add('finished');
        document.getElementById('opp-status').innerHTML = `<span>SELESAI - ${safeData.points} DP</span>`;

        if (safeData.won && !duel.roundOver && !duel.graceInterval) {
            duel.graceTimeLeft = 30;
            document.getElementById('timer-my').innerText = `LAWAN SELESAI! SISA WAKTU: ${duel.graceTimeLeft}s`;
            triggerGlobalGlitch(300, 'error');

            duel.graceInterval = setInterval(() => {
                duel.graceTimeLeft--;
                if (duel.graceTimeLeft <= 0) {
                    clearInterval(duel.graceInterval);
                    duel.graceInterval = null;
                    document.getElementById('timer-my').innerText = '';
                    if (!duel.roundOver) {
                        const elapsed = stopTimer(duel.timer);
                        duel.timeSec = elapsed;
                        duel.roundOver = true;
                        duel.roundWon = false;
                        duel.points = 0;
                        document.getElementById('duel-my').classList.add('finished');
                        document.getElementById('feedback-my').innerHTML = '<span style="color:var(--accent-red);">WAKTU HABIS! RONDE GAGAL</span>';
                        broadcastGuessResult({
                            round_finished: true,
                            won: false,
                            timeSec: elapsed,
                            points: 0,
                            wrong: duel.wrong,
                            totalGuesses: duel.history.length
                        });
                        if (duel.oppRoundOver) finishRound();
                    }
                } else {
                    document.getElementById('timer-my').innerText = `LAWAN SELESAI! SISA WAKTU: ${duel.graceTimeLeft}s`;
                }
            }, 1000);
        }
        if (duel.roundOver) finishRound();
        persistDuelState();
    } else if (safeData.still_playing) {
        duel.oppMin = safeData.min;
        duel.oppMax = safeData.max;
        duel.oppWrong = safeData.wrong;
        if (safeData.lives !== undefined) {
            duel.oppLives = safeData.lives;
            updateHeartsUI('hearts-opp', safeData.lives);
        }
        document.getElementById('low-opp').innerText = safeData.min;
        document.getElementById('high-opp').innerText = safeData.max;

        if (safeData.lastGuess !== null) {
            updateHistoryUI(safeData.lastGuess, 'history-opp');
        }

        const direction = safeData.lastGuess !== null ? `Tebakan: [${safeData.lastGuess}]` : '';
        document.getElementById('opp-status').innerHTML = `<span>${direction} - ${safeData.wrong} salah</span>`;
        document.getElementById('feedback-opp').innerText = `> ${safeData.min}-${safeData.max} - ${safeData.wrong} salah`;
    }
}
function finishRound() {
    if (duel.oppTimerInterval) clearInterval(duel.oppTimerInterval);
    
    // Determine winner of the round:
    let winner = null;
    if (duel.roundWon && duel.oppRoundWon) {
        winner = duel.timeSec < duel.oppTimeSec ? 'me' : 'opp';
    } else if (duel.roundWon) {
        winner = 'me';
    } else if (duel.oppRoundWon) {
        winner = 'opp';
    }

    duel.roundResults.push({
        round: duel.currentRound,
        winner: winner,
        myPoints: duel.points,
        oppPoints: duel.oppPoints,
        myTime: duel.timeSec,
        oppTime: duel.oppTimeSec
    });

    if (winner === 'me') {
        duel.myRoundWins++;
        const pips = document.querySelectorAll('#pips-my .pip');
        if (pips[duel.myRoundWins - 1]) pips[duel.myRoundWins - 1].classList.add('won');
        triggerGlobalGlitch(300, 'success');
    } else if (winner === 'opp') {
        duel.oppRoundWins++;
        const pips = document.querySelectorAll('#pips-opp .pip');
        if (pips[duel.oppRoundWins - 1]) pips[duel.oppRoundWins - 1].classList.add('won');
        triggerGlobalGlitch(300, 'error');
    }

    persistDuelState();

    // Check match end condition (Best of 3)
    if (duel.myRoundWins >= 2 || duel.oppRoundWins >= 2 || duel.currentRound >= 3) {
        duel.done = true;
        showDuelResult();
    } else {
        prepareNextRound();
    }
}

function prepareNextRound() {
    // Show Round Transition
    const nextRound = duel.currentRound + 1;
    document.getElementById('feedback-my').innerHTML = `SIAP UNTUK RONDE ${nextRound}...`;
    document.getElementById('feedback-opp').innerHTML = `MENUNGGU...`;

    setTimeout(() => {
        if (duel.myRole === 'player1') {
            const config = difficulties[duel.difficulty];
            const target1 = Math.floor(Math.random() * config.max) + 1;
            let target2 = Math.floor(Math.random() * config.max) + 1;
            while (target2 === target1 && config.max > 1) target2 = Math.floor(Math.random() * config.max) + 1;

            broadcastGuessResult({
                next_round_sync: true,
                target1: target1,
                target2: target2
            });
            
            GameEngine.setDuelTarget(target1);
            startNextRound();
        }
    }, 2000);
}

function startNextRound() {
    duel.currentRound++;
    
    if (duel.graceInterval) {
        clearInterval(duel.graceInterval);
        duel.graceInterval = null;
    }

    duel.roundOver = false;
    duel.oppRoundOver = false;
    duel.roundWon = false;
    duel.oppRoundWon = false;
    
    // Reset Round Stats
    const config = difficulties[duel.difficulty];
    duel.lives = config.lives;
    duel.wrong = 0;
    duel.min = 1;
    duel.max = config.max;
    duel.history = [];
    
    duel.oppLives = config.lives;
    duel.oppWrong = 0;
    duel.oppMin = 1;
    duel.oppMax = config.max;

    // Reset UI
    document.getElementById('duel-round-status').innerText = `ROUND ${duel.currentRound}`;
    document.getElementById('duel-my').classList.remove('finished');
    document.getElementById('duel-opp').classList.remove('finished');
    document.getElementById('timer-my').innerHTML = '';
    document.getElementById('timer-opp').innerHTML = '';
    
    // Show lives for Duel
    document.getElementById('hearts-my').style.display = 'flex';
    document.getElementById('hearts-opp').style.display = 'flex';
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

    // Restart Timer
    stopTimer(duel.timer);
    duel.timer = startTimer('stopwatch-my');
    
    // Opponent Timer Sync
    if (duel.oppTimerInterval) clearInterval(duel.oppTimerInterval);
    duel.oppTimerStart = Date.now();
    duel.oppTimerInterval = setInterval(() => {
        if (!duel.oppRoundOver) {
            const elapsed = (Date.now() - duel.oppTimerStart) / 1000;
            document.getElementById('stopwatch-opp').innerText = formatTime(elapsed);
        }
    }, 100);

    triggerGlobalGlitch(400, 'neutral');
    playSFX('pageOpen');
    persistDuelState();
}


function showDuelResult(isForfeit = false) {
    stopTimer(duel.timer);
    if (duel.oppTimerInterval) clearInterval(duel.oppTimerInterval);
    if (duel.graceInterval) clearInterval(duel.graceInterval);
    clearOpponentOfflineCountdown();
    clearDuelState();

    // Clean up channel
    if (duel.channel) { supabaseClient.removeChannel(duel.channel); duel.channel = null; }

    // Match Winner Logic
    const MATCH_WINNER_BONUS = 1000;
    let matchWinner = null;
    let myTotalDP = duel.roundResults.reduce((sum, r) => sum + r.myPoints, 0);
    let oppTotalDP = duel.roundResults.reduce((sum, r) => sum + r.oppPoints, 0);

    if (isForfeit) {
        matchWinner = gameState.currentUser;
        myTotalDP += MATCH_WINNER_BONUS;
    } else if (duel.myRoundWins > duel.oppRoundWins) {
        matchWinner = gameState.currentUser;
        myTotalDP += MATCH_WINNER_BONUS;
    } else if (duel.oppRoundWins > duel.myRoundWins) {
        matchWinner = duel.oppName;
        oppTotalDP += MATCH_WINNER_BONUS;
    }

    // Hapus room dari Supabase agar tidak menjadi ghost room
    if (duel.room) {
        supabaseClient.from('duel_rooms').delete().eq('id', duel.room.id).then(() => {});
    }

    // Save Score to Leaderboard (hanya untuk duel yang belum fully server-authoritative)
    if (gameState.currentUser) {
        GameEngine.saveDuelScore(duel.difficulty, duel.history.length, gameState.currentUser, myTotalDP, Math.round(duel.timeSec));
    }

    const myName = escapeHtml((gameState.currentUser || '').toUpperCase());
    const oppName = escapeHtml((duel.oppName || '').toUpperCase());
    const safeWinner = matchWinner ? escapeHtml(matchWinner.toUpperCase()) : 'DRAW';
    
    // Generate Round Summary HTML
    let roundsHtml = duel.roundResults.map(r => `
        <div style="display:grid; grid-template-columns: 1fr 2fr 1fr; gap:0.5rem; font-size:0.7rem; color:var(--text-dim); border-bottom:1px solid rgba(255,255,255,0.05); padding:0.4rem 0;">
            <div style="text-align:left; ${r.winner === 'me' ? 'color:var(--neon-cyan);' : ''}">${r.myPoints} DP</div>
            <div style="text-align:center;">RONDE ${r.round}</div>
            <div style="text-align:right; ${r.winner === 'opp' ? 'color:var(--neon-magenta);' : ''}">${r.oppPoints} DP</div>
        </div>
    `).join('');

    const content = document.getElementById('duel-result-content');
    content.innerHTML = `
        <div class="result-status ${matchWinner === gameState.currentUser ? 'win-color' : 'lose-color'}">MATCH SELESAI</div>
        <h1 style="-webkit-text-fill-color:initial; color:#fff; font-size:2rem;">PEMENANG: ${safeWinner}</h1>
        
        <div style="margin: 1.5rem 0; background:rgba(255,255,255,0.02); padding:1rem; border:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex; justify-content:space-between; font-family:var(--font-data); font-size:0.6rem; color:var(--neon-cyan); margin-bottom:0.5rem;">
                <span>SUMMARY</span>
                <span>BEST OF 3</span>
            </div>
            ${roundsHtml}
            ${matchWinner === gameState.currentUser ? `<div style="text-align:center; color:var(--neon-cyan); font-size:0.7rem; margin-top:0.5rem;">+${MATCH_WINNER_BONUS} WINNER BONUS</div>` : ''}
        </div>

        <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;">
            <div style="flex:1; min-width:140px; padding:1rem; border:1px solid rgba(255,255,255,0.1); background:rgba(0,242,255,0.03);">
                <div class="duel-player-label duel-label-me">${myName}</div>
                <div style="font-size:1.8rem; font-weight:900; color:var(--neon-cyan); font-family:var(--font-data);">${myTotalDP} DP</div>
                <div style="font-size:0.6rem; color:var(--text-dim);">${duel.myRoundWins} RONDE MENANG</div>
            </div>
            <div style="flex:1; min-width:140px; padding:1rem; border:1px solid rgba(255,255,255,0.1); background:rgba(0,242,255,0.03);">
                <div class="duel-player-label">${oppName}</div>
                <div style="font-size:1.8rem; font-weight:900; color:var(--neon-magenta); font-family:var(--font-data);">${oppTotalDP} DP</div>
                <div style="font-size:0.6rem; color:var(--text-dim);">${duel.oppRoundWins} RONDE MENANG</div>
            </div>
        </div>`;

    document.getElementById('duel-result-overlay').style.display = 'flex';
    triggerGlobalGlitch(400, matchWinner === gameState.currentUser ? 'success' : 'error');
}

// ============================================================
// CUSTOM CONFIRM MODAL (replaces native confirm/alert)
// ============================================================
let confirmModal = null;

function ensureConfirmModal() {
    if (confirmModal) return confirmModal;

    const overlay = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('modal-confirm-title');
    const messageEl = document.getElementById('modal-confirm-message');
    const okBtn = document.getElementById('modal-confirm-ok');
    const cancelBtn = document.getElementById('modal-confirm-cancel');
    const panel = overlay ? overlay.querySelector('.modal-panel') : null;

    if (!overlay || !titleEl || !messageEl || !okBtn || !cancelBtn || !panel) return null;

    const state = {
        overlay,
        panel,
        titleEl,
        messageEl,
        okBtn,
        cancelBtn,
        resolve: null,
        prevFocus: null,
        keyHandler: null,
        closeTimer: null,
        transitionHandler: null
    };

    function close(result) {
        if (!state.resolve) return;
        const resolve = state.resolve;
        state.resolve = null;

        if (state.closeTimer) clearTimeout(state.closeTimer);

        // Glitch close animation (match page transition feel)
        triggerGlitchOnElement(state.panel, 200, 'neutral');
        state.overlay.classList.remove('is-open');
        state.overlay.classList.add('is-closing');

        state.closeTimer = setTimeout(() => {
            state.overlay.classList.remove('is-open', 'is-closing');
            state.overlay.style.display = 'none';
            state.overlay.setAttribute('aria-hidden', 'true');

            if (state.keyHandler) document.removeEventListener('keydown', state.keyHandler, true);
            state.keyHandler = null;

            const prev = state.prevFocus;
            state.prevFocus = null;
            if (prev && typeof prev.focus === 'function') prev.focus();

            resolve(result);
        }, 220);
    }

    okBtn.addEventListener('click', () => close(true));
    cancelBtn.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
    });

    state.open = function open({ title = 'KONFIRMASI', message = '', okText = 'OK', cancelText = 'BATAL' } = {}) {
        if (state.resolve) close(false);

        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        state.prevFocus = document.activeElement;
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        overlay.classList.remove('is-closing');
        overlay.classList.remove('is-open');
        requestAnimationFrame(() => overlay.classList.add('is-open'));
        triggerGlitchOnElement(state.panel, 220, 'neutral');

        state.keyHandler = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                close(false);
                return;
            }
            if (ev.key === 'Enter') {
                ev.preventDefault();
                close(document.activeElement === cancelBtn ? false : true);
            }
        };
        document.addEventListener('keydown', state.keyHandler, true);

        setTimeout(() => okBtn.focus(), 0);

        return new Promise((resolve) => {
            state.resolve = resolve;
        });
    };

    confirmModal = state;
    return confirmModal;
}

function showConfirm(message, options = {}) {
    const modal = ensureConfirmModal();
    if (!modal) {
        console.warn('[MODAL] Confirm modal missing; blocking action by default');
        return Promise.resolve(false);
    }
    return modal.open({ ...options, message });
}

async function exitDuel() {
    // Check if duel game is actively in progress (not finished)
    const isGameActive = duel.channel && !document.getElementById('duel-result-overlay').style.display.includes('flex');

    if (isGameActive) {
        const confirmed = await showConfirm(
            'Jika kamu keluar, kamu akan KALAH dan tidak mendapatkan poin.\nYakin ingin keluar?',
            { title: 'KELUAR DUEL', okText: 'KELUAR', cancelText: 'BATAL' }
        );
        if (!confirmed) return;

        // Broadcast forfeit to opponent
        if (duel.channel) {
            duel.channel.send({
                type: 'broadcast',
                event: 'guess',
                payload: { sender: gameState.currentUser, forfeit: true }
            });
        }
    }

    // Hapus room dari database jika kita adalah salah satu pesertanya
    if (duel.room) {
        supabaseClient.from('duel_rooms').delete().eq('id', duel.room.id).then(() => {});
    }

    stopTimer(duel.timer);
    if (duel.oppTimerInterval) clearInterval(duel.oppTimerInterval);
    if (duel.graceInterval) clearInterval(duel.graceInterval);
    if (duel.channel) { supabaseClient.removeChannel(duel.channel); duel.channel = null; }
    clearOpponentOfflineCountdown();
    clearDuelState();
    cleanupMatchmaking();
    document.getElementById('duel-arena').style.display = 'none';
    document.getElementById('duel-result-overlay').style.display = 'none';
    document.getElementById('main-wrapper-solo').style.display = '';
    showPage('page-menu');
}

// ============================================================
// SCORE API
// ============================================================
const SCORE_RPC_POINTS = 'get_my_points_secure';

async function loadUserPoints() {
    if (!supabaseClient || !gameState.currentUser) return;
    const uname = gameState.currentUser;

    const { data: secureRows, error: secureErr } = await supabaseClient.rpc(SCORE_RPC_POINTS);
    if (!secureErr && Array.isArray(secureRows)) {
        let sp = 0;
        let dp = 0;
        secureRows.forEach((row) => {
            if (row.mode === 'solo') sp = clampInt(row.points, 0, 100000000, 0);
            else if (row.mode === 'duel') dp = clampInt(row.points, 0, 100000000, 0);
        });
        document.getElementById('display-sp').innerText = formatNumber(sp);
        document.getElementById('display-dp').innerText = formatNumber(dp);
        return;
    }
    if (secureErr && !isMissingRpcError(secureErr)) {
        console.warn('[POINTS] secure RPC failed, using legacy read fallback:', secureErr?.message || secureErr);
    }

    const { data } = await supabaseClient
        .from('scores')
        .select('mode, points')
        .eq('username', uname);

    let sp = 0, dp = 0;
    if (data) {
        data.forEach(row => {
            if (row.mode === 'solo') sp += row.points || 0;
            else if (row.mode === 'duel') dp += row.points || 0;
        });
    }
    document.getElementById('display-sp').innerText = formatNumber(sp);
    document.getElementById('display-dp').innerText = formatNumber(dp);
}

// Full number with dot separator (Indonesian style: 100.000)
function formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Abbreviated for leaderboard (10.6K)
function formatPointsShort(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
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
        const safeUsername = escapeHtml((entry.username || 'USER').toUpperCase());
        const safeDifficulty = escapeHtml(String(entry.difficulty || '-').toUpperCase());
        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <span class="rank-tag">#${index + 1}</span>
                <span class="player-name-tag">${safeUsername}</span>
            </div>
            <div style="display:flex; align-items:center; gap:1rem;">
                <span class="score-value">${formatPointsShort(entry.points || 0)} ${pointLabel}</span>
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

function triggerGlitchOnElement(target, duration = 200, type = 'neutral') {
    const wrapper = target;
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
        streak.style.pointerEvents = 'none';
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

function triggerGlobalGlitch(duration = 200, type = 'neutral') {
    let wrapper = document.querySelector('.main-wrapper.active');
    if (!wrapper) wrapper = document.getElementById('duel-arena');
    if (!wrapper || wrapper.style.display === 'none') wrapper = document.querySelector('.main-wrapper'); 
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
        streak.style.pointerEvents = 'none';
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
    feedback.textContent = msg;
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

// Expose functions to window for obfuscator compatibility
window['goBack'] = goBack;
window['toggleBGM'] = toggleBGM;
window['userAuth'] = userAuth;
window['selectMode'] = selectMode;
window['showPage'] = showPage;
window['showLeaderboard'] = typeof showLeaderboard !== 'undefined' ? showLeaderboard : () => {};
window['cancelMatchmaking'] = cancelMatchmaking;
window['checkGuess'] = checkGuess;
window['switchLeaderboardTab'] = typeof switchLeaderboardTab !== 'undefined' ? switchLeaderboardTab : () => {};
window['exitDuel'] = typeof exitDuel !== 'undefined' ? exitDuel : () => {};
window['submitDuelGuess'] = typeof submitDuelGuess !== 'undefined' ? submitDuelGuess : () => {};
window['startGame'] = startGame;