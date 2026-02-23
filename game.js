// Supabase Configuration (REPLACE WITH YOUR KEYS)
const SUPABASE_URL = 'https://pfzdtwvsghdwchrmogap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmemR0d3ZzZ2hkd2Nocm1vZ2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM1MzgsImV4cCI6MjA4NjM3OTUzOH0.dfD5GF7luaWCJ_nL-kjMIh51D143fw93mbgsIDYutUQ';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Game State
let gameState = {
    targetNumber: 0,
    maxLives: 0,
    currentLives: 0,
    minRange: 1,
    maxRange: 100,
    history: [],
    difficulty: '',
    currentUser: null,
    session: null
};

// User Authentication Logic
const SESSION_KEY = 'guess_it_session_jwt'; // Supabase handles most of this

const userAuth = {
    register: async () => {
        const user = document.getElementById('reg-user').value.trim();
        const pass = document.getElementById('reg-pass').value.trim();
        
        if (!user || !pass) {
            setFeedback("ISI SEMUA DATA", true);
            return;
        }
        
        const { data, error } = await supabase.auth.signUp({
            email: `${user}@guessit.game`, // Mock email for simple username login
            password: pass,
            options: {
                data: { username: user }
            }
        });
        
        if (error) {
            setFeedback(error.message.toUpperCase(), true);
            return;
        }
        
        setFeedback("DAFTAR BERHASIL. CEK EMAIL (JIKA AKTIF)", false);
        setTimeout(() => showPage('page-login'), 1500);
    },
    
    login: async () => {
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value.trim();
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: `${user}@guessit.game`,
            password: pass
        });
        
        if (error) {
            setFeedback("DATA SALAH / BELUM VERIFIKASI", true);
            triggerFlash('flash-red');
            return;
        }
        
        gameState.session = data.session;
        gameState.currentUser = data.user.user_metadata.username;
        
        userAuth.updateUI();
        showPage('page-menu');
        triggerGlobalGlitch(300, 'success');
    },
    
    logout: async () => {
        await supabase.auth.signOut();
        gameState.currentUser = null;
        gameState.session = null;
        userAuth.updateUI();
        showPage('page-menu');
        triggerGlobalGlitch(300, 'error');
    },
    
    checkSession: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            gameState.session = session;
            gameState.currentUser = session.user.user_metadata.username;
        }
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
            logoutBtn.style.display = 'block';
            authActions.style.display = 'none';
        } else {
            profile.style.display = 'flex';
            display.innerText = "GUEST";
            logoutBtn.style.display = 'none';
            authActions.style.display = 'flex';
        }
    }
};

// Call session check on load
document.addEventListener('DOMContentLoaded', () => {
    userAuth.checkSession();
});

const difficulties = {
    easy: { max: 10, lives: 5 },
    medium: { max: 50, lives: 7 },
    hard: { max: 100, lives: 10 }
};

// UI Elements
const pages = ['page-menu', 'page-difficulty', 'page-game', 'page-result', 'page-leaderboard', 'page-login', 'page-register'];
const inputField = document.getElementById('guess-input');
const backBtn = document.getElementById('back-btn');

function showPage(pageId, isPopState = false) {
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (id === pageId) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    if (!isPopState) {
        history.pushState({ pageId }, '', '#' + pageId);
    }

    // Back Button Visibility
    if (pageId === 'page-menu') {
        backBtn.classList.remove('visible');
    } else {
        backBtn.classList.add('visible');
    }

    // Transition Glitch
    triggerGlobalGlitch();

    if (pageId === 'page-game') {
        inputField.value = '';
        inputField.focus();
        document.getElementById('feedback-msg').innerText = '';
    }
}

window.onpopstate = (e) => {
    const pageId = e.state ? e.state.pageId : 'page-menu';
    showPage(pageId, true);
};

function goBack() { history.back(); }

function startGame(level) {
    const config = difficulties[level];
    gameState = {
        difficulty: level,
        maxRange: config.max,
        minRange: 1,
        maxLives: config.lives,
        currentLives: config.lives,
        targetNumber: Math.floor(Math.random() * config.max) + 1,
        history: []
    };

    updateStatsUI();
    renderHearts();
    document.getElementById('history-list').innerHTML = '';
    showPage('page-game');
    console.log(`Target: ${gameState.targetNumber}`);
}

function renderHearts() {
    const container = document.getElementById('hearts-container');
    container.innerHTML = '';
    for (let i = 0; i < gameState.maxLives; i++) {
        const heart = document.createElement('div');
        heart.innerHTML = `<svg class="heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
        container.appendChild(heart.firstChild);
    }
}

function updateStatsUI() {
    document.getElementById('low-display').innerText = gameState.minRange;
    document.getElementById('high-display').innerText = gameState.maxRange;
    const bgTarget = document.getElementById('bg-target');
    if (bgTarget) bgTarget.innerText = gameState.targetNumber; // Show target number faintly in background
}

function checkGuess() {
    const guess = parseInt(inputField.value);
    
    if (isNaN(guess) || guess < gameState.minRange || guess > gameState.maxRange) {
        triggerFlash('flash-red');
        setFeedback("ANGKA_LUAR_BATAS", true);
        return;
    }

    gameState.history.push(guess);
    updateHistoryUI(guess);

    if (guess === gameState.targetNumber) {
        triggerFlash('flash-cyan');
        triggerGlobalGlitch(400, 'success');
        showResult(true);
    } else {
        gameState.currentLives--;
        updateHeartsUI();
        triggerFlash('flash-red');
        triggerGlobalGlitch(250, 'error');

        if (gameState.currentLives <= 0) {
            showResult(false);
        } else {
            let hint = "";
            if (guess < gameState.targetNumber) {
                gameState.minRange = Math.max(gameState.minRange, guess + 1);
                hint = `&gt; TERLALU_RENDAH: TEBAK_${gameState.minRange}_KE_${gameState.maxRange}`;
            } else {
                gameState.maxRange = Math.min(gameState.maxRange, guess - 1);
                hint = `&gt; TERLALU_TINGGI: TEBAK_${gameState.minRange}_KE_${gameState.maxRange}`;
            }
            updateStatsUI();
            setFeedback(hint, true);
            inputField.value = '';
            inputField.focus();
        }
    }
}

function updateHeartsUI() {
    const hearts = document.querySelectorAll('.heart');
    const lostIndex = gameState.maxLives - gameState.currentLives - 1;
    if (hearts[gameState.currentLives]) {
        hearts[gameState.currentLives].classList.add('lost');
    }
}

function triggerFlash(className) {
    const flash = document.getElementById('screen-flash');
    flash.className = 'screen-flash ' + className;
    setTimeout(() => { flash.className = 'screen-flash'; }, 300);
}

function triggerGlobalGlitch(duration = 200, type = 'neutral') {
    const wrapper = document.querySelector('.main-wrapper');
    const scanline = document.querySelector('.scanlines');
    
    // Determine class and colors
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
    if (scanline) scanline.classList.add('scanline-flicker');
    
    const blocks = [];
    const count = type === 'neutral' ? 2 : 5;
    
    for(let i=0; i<count; i++) {
        const b = document.createElement('div');
        b.className = 'signal-block';
        b.style.setProperty('--block-color', blockGradient);
        b.style.top = (Math.random() * 90) + '%';
        b.style.height = (Math.random() * 15 + 5) + '%';
        wrapper.appendChild(b);
        blocks.push(b);
    }

    setTimeout(() => {
        wrapper.classList.remove(glitchClass);
        if (scanline) scanline.classList.remove('scanline-flicker');
        blocks.forEach(b => b.remove());
    }, duration);
}

function setFeedback(msg, shouldShake) {
    const feedback = document.getElementById('feedback-msg');
    feedback.innerHTML = msg;
    if (shouldShake) {
        const wrapper = document.querySelector('.main-wrapper');
        wrapper.classList.remove('shake');
        void wrapper.offsetWidth;
        wrapper.classList.add('shake');
    }
}

function updateHistoryUI(guess) {
    const list = document.getElementById('history-list');
    const tag = document.createElement('span');
    tag.className = 'hist-tag';
    tag.innerText = `[${guess}]`;
    list.prepend(tag);
}

// Leaderboard Logic
async function saveScore(difficulty, attempts, name) {
    if (!supabase) return;
    
    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('scores').insert([
        { 
            user_id: user.id,
            username: name,
            difficulty: difficulty,
            attempts: attempts
        }
    ]);
    
    if (error) {
        console.error("Error saving score:", error);
    }
}

async function showLeaderboard() {
    const container = document.getElementById('leaderboard-content');
    container.innerHTML = '<p class="subtitle" style="text-align:center; opacity:0.5; margin-top:2rem;">&gt; MENGAMBIL_DATA_DARI_CLOUD...</p>';
    
    showPage('page-leaderboard');

    if (!supabase) return;

    const { data, error } = await supabase
        .from('scores')
        .select('*')
        .order('attempts', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(10); // Show top 10 global instead of 5 local

    if (error) {
        container.innerHTML = '<p class="subtitle" style="text-align:center; color:var(--accent-red);">GAGAL MENGHUBUNGI SERVER</p>';
        return;
    }

    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="subtitle" style="text-align:center; opacity:0.5; margin-top:2rem;">BELUM ADA REKOR GLOBAL</p>';
        return;
    }

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
                <span class="score-value">${entry.attempts} PT</span>
                <span style="font-size: 0.6rem; color: var(--text-dim);">${dateStr}</span>
            </div>
        `;
        container.appendChild(el);
    });
}

// Old localStorage showLeaderboard removed and replaced by async Supabase version above

function showResult(isWin) {
    const content = document.getElementById('result-content');
    const colorClass = isWin ? 'win-color' : 'lose-color';
    const statusText = isWin ? 'BERHASIL' : 'GAGAL';
    const subText = isWin 
        ? `Kamu hebat! Angkanya adalah: ${gameState.targetNumber}` 
        : `Sayang sekali. Angkanya adalah: ${gameState.targetNumber}`;

    let extraInfo = "";
    if (isWin) {
        const attempts = gameState.history.length;
        if (gameState.currentUser) {
            extraInfo = `
                <div class="win-text-small">Diselesaikan dalam ${attempts} tebakan!</div>
                <div class="name-entry-area">
                    <input type="text" id="player-name" value="${gameState.currentUser.toUpperCase()}" placeholder="MASUKKAN NAMA" maxlength="10">
                    <button class="btn btn-primary" id="save-score-btn" onclick="handleSaveScore()">SIMPAN REKOR</button>
                </div>
            `;
        } else {
            extraInfo = `
                <div class="win-text-small">Diselesaikan dalam ${attempts} tebakan!</div>
                <div class="guest-notice">
                    <p>&gt; DAFTAR_LOGIN_UNTUK_SIMPAN_SKOR</p>
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <button class="btn btn-outline" style="font-size: 0.7rem; padding: 0.5rem;" onclick="showPage('page-login')">LOGIN Sekarang</button>
                        <button class="btn btn-outline" style="font-size: 0.7rem; padding: 0.5rem;" onclick="showPage('page-register')">BUAT AKUN</button>
                    </div>
                </div>
            `;
        }
    }

    content.innerHTML = `
        <div class="result-status ${colorClass}">${isWin ? 'MENANG' : 'KALAH'}</div>
        <h1 style="-webkit-text-fill-color: initial; color: #fff;">${statusText}</h1>
        <p class="subtitle" style="color: var(--text-dim)">&gt; ${subText}</p>
        ${extraInfo}
    `;
    showPage('page-result');
}

async function handleSaveScore() {
    const nameInput = document.getElementById('player-name');
    const saveBtn = document.getElementById('save-score-btn');
    const name = nameInput.value.trim().toUpperCase() || "PLAYER";
    const attempts = gameState.history.length;
    
    // Disable UI immediately
    nameInput.disabled = true;
    saveBtn.disabled = true;
    saveBtn.innerText = "MENYIMPAN...";

    await saveScore(gameState.difficulty, attempts, name);
    
    saveBtn.innerText = "TERSIMPAN!";
    triggerGlobalGlitch(300, 'success');
}

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.getElementById('page-game').classList.contains('active')) {
        checkGuess();
    }
});
