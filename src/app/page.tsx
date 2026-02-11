"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Page = 'page-menu' | 'page-difficulty' | 'page-game' | 'page-result' | 'page-leaderboard' | 'page-login';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTIES = {
  easy: { max: 10, lives: 5 },
  medium: { max: 50, lives: 7 },
  hard: { max: 100, lives: 10 }
};

const AUDIO_FILES = {
  transition1: '/transition1.mp3',
  transition2: '/transition2.mp3',
  select: '/select.mp3',
  wrong: '/salah.mp3',
  win: '/menang.mp3',
  lose: '/kalah.mp3'
};

export default function GamePage() {
  const [activePage, setActivePage] = useState<Page>('page-menu');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [targetNumber, setTargetNumber] = useState(0);
  const [maxLives, setMaxLives] = useState(0);
  const [currentLives, setCurrentLives] = useState(0);
  const [minRange, setMinRange] = useState(1);
  const [maxRange, setMaxRange] = useState(100);
  const [history, setHistory] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [isWin, setIsWin] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  // Initialize Audio
  useEffect(() => {
    Object.entries(AUDIO_FILES).forEach(([key, src]) => {
      audioRefs.current[key] = new Audio(src);
    });
  }, []);

  const playSound = useCallback((name: string) => {
    const sound = audioRefs.current[name];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.log("Audio play failed:", e));
    }
  }, []);

  const triggerFlash = (type: 'cyan' | 'red') => {
    const flash = document.getElementById('screen-flash');
    if (flash) {
      flash.className = `screen-flash flash-${type}`;
      setTimeout(() => { flash.className = 'screen-flash'; }, 300);
    }
  };

  const triggerGlitch = useCallback((duration = 200, type: 'neutral' | 'error' | 'success' = 'neutral') => {
    const wrapper = document.querySelector('.main-wrapper');
    const scanline = document.querySelector('.scanlines');
    if (!wrapper) return;

    let glitchClass = 'glitch-active';
    if (type === 'error') glitchClass = 'glitch-error';
    else if (type === 'success') glitchClass = 'glitch-success';

    wrapper.classList.add(glitchClass);
    if (scanline) scanline.classList.add('scanline-flicker');

    setTimeout(() => {
      wrapper.classList.remove(glitchClass);
      if (scanline) scanline.classList.remove('scanline-flicker');
    }, duration);
  }, []);

  const showPage = useCallback((page: Page, isBack = false) => {
    playSound(isBack ? 'transition2' : 'transition1');
    setActivePage(page);
    triggerGlitch();
    if (page === 'page-leaderboard') fetchLeaderboard();
    if (page === 'page-game') setIsSaved(false);
  }, [playSound, triggerGlitch]);

  const startGame = (level: Difficulty) => {
    const config = DIFFICULTIES[level];
    setDifficulty(level);
    setMaxRange(config.max);
    setMinRange(1);
    setMaxLives(config.lives);
    setCurrentLives(config.lives);
    setTargetNumber(Math.floor(Math.random() * config.max) + 1);
    setHistory([]);
    setFeedback("");
    setGuessInput("");
    showPage('page-game');
  };

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/scores');
      const data = await res.json();
      if (Array.isArray(data)) setLeaderboard(data);
    } catch (err) {
      console.error("Leaderboard fetch failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveScore = async () => {
    if (!playerName) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playerName.toUpperCase(),
          attempts: history.length,
          difficulty: difficulty
        })
      });
      if (res.ok) {
        setIsSaved(true);
        triggerGlitch(400, 'success');
      }
    } catch (err) {
      console.error("Save score failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const user = formData.get('username');
    const pass = formData.get('password');

    setIsLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      if (res.ok) {
        const data = await res.json();
        triggerGlitch(400, 'success');
        setTimeout(() => {
          alert(`Selamat datang, ${data.user}!`);
          showPage('page-menu', true);
        }, 500);
      } else {
        triggerGlitch(300, 'error');
        alert("Login gagal.");
      }
    } catch (err) {
      console.error("Login Error", err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkGuess = () => {
    const guess = parseInt(guessInput);
    if (isNaN(guess) || guess < minRange || guess > maxRange) {
      playSound('wrong');
      triggerFlash('red');
      setFeedback("ANGKA_LUAR_BATAS");
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }

    const newHistory = [guess, ...history];
    setHistory(newHistory);

    if (guess === targetNumber) {
      playSound('win');
      triggerFlash('cyan');
      triggerGlitch(400, 'success');
      setIsWin(true);
      showPage('page-result');
    } else {
      playSound('wrong');
      const newLives = currentLives - 1;
      setCurrentLives(newLives);
      triggerFlash('red');
      triggerGlitch(250, 'error');

      if (newLives <= 0) {
        setIsWin(false);
        showPage('page-result');
      } else {
        if (guess < targetNumber) {
          setMinRange(Math.max(minRange, guess + 1));
        } else {
          setMaxRange(Math.min(maxRange, guess - 1));
        }
        setGuessInput("");
        setShaking(true);
        setTimeout(() => setShaking(false), 400);
        setFeedback("");
      }
    }
  };

  return (
    <div className={shaking ? "shake" : ""}>
      <header className="nav-header">
        <button
          className={`back-btn ${activePage !== 'page-menu' ? 'visible' : ''}`}
          onClick={() => showPage('page-menu', true)}
          onMouseOver={() => playSound('select')}
        >
          Kembali
        </button>
      </header>

      {/* Section: Main Menu */}
      <section id="page-menu" className={activePage === 'page-menu' ? 'active' : ''}>
        <h1>GUESS<br />IT.</h1>
        <p className="subtitle">&gt; ASAH_LOGIKA_&_INSTING</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => showPage('page-difficulty')} onMouseOver={() => playSound('select')}>MULAI MAIN</button>
          <button className="btn" onClick={() => showPage('page-leaderboard')} onMouseOver={() => playSound('select')}>SKOR TERTINGGI</button>
          <button className="btn btn-small" style={{ marginTop: '1rem', opacity: 0.6 }} onClick={() => showPage('page-login')} onMouseOver={() => playSound('select')}>LOGIN</button>
        </div>
      </section>

      {/* Section: Difficulty Selection */}
      <section id="page-difficulty" className={activePage === 'page-difficulty' ? 'active' : ''}>
        <h1>LEVEL.</h1>
        <p className="subtitle">&gt; PILIH_LEVEL</p>
        <div className="diff-list">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map(level => (
            <div key={level} className="diff-btn" onClick={() => startGame(level)} onMouseOver={() => playSound('select')}>
              <span className="diff-name">{level.toUpperCase() === 'EASY' ? 'MUDAH' : level.toUpperCase() === 'MEDIUM' ? 'SEDANG' : 'SULIT'}</span>
              <span className="diff-info">1-{DIFFICULTIES[level].max} [{DIFFICULTIES[level].lives}_NYAWA]</span>
            </div>
          ))}
        </div>
      </section>

      {/* Section: Game Play */}
      <section id="page-game" className={activePage === 'page-game' ? 'active' : ''}>
        <div id="bg-target" className="bg-number">{targetNumber}</div>
        <div className="hearts-container">
          {Array.from({ length: maxLives }).map((_, i) => (
            <svg key={i} className={`heart ${i >= currentLives ? 'lost' : ''}`} viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ))}
        </div>

        <div className="stat-row">
          <div className="stat-cell">
            <span className="stat-label">RANGE_MIN</span>
            <span className="stat-value">{minRange}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">RANGE_MAX</span>
            <span className="stat-value">{maxRange}</span>
          </div>
        </div>

        <div className="feedback-area" id="feedback-msg">
          {feedback || (history.length > 0 && `&gt; ${history[0] > targetNumber ? 'TERLALU_TINGGI' : 'TERLALU_RENDAH'}: TEBAK_${minRange}_KE_${maxRange}`)}
        </div>

        <div className="input-section">
          <input
            type="number"
            id="guess-input"
            placeholder="00"
            min="1"
            max="100"
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && checkGuess()}
            autoFocus
          />
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginBottom: '2rem' }} onClick={checkGuess} onMouseOver={() => playSound('select')}>TEBAK ANGKA</button>

        <div className="history-bar">
          {history.map((g, i) => (
            <span key={i} className="hist-tag">[{g}]</span>
          ))}
        </div>
      </section>

      {/* Section: Results */}
      <section id="page-result" className={activePage === 'page-result' ? 'active' : ''}>
        <div id="result-content">
          <div className={`result-status ${isWin ? 'win-color' : 'lose-color'}`}>
            {isWin ? 'MENANG' : 'KALAH'}
          </div>
          <h1>{isWin ? 'BERHASIL' : 'GAGAL'}</h1>
          <p className="subtitle" style={{ color: '#888', textTransform: 'none', border: 'none', background: 'none' }}>
            &gt; {isWin ? `Kamu hebat! Angkanya adalah: ${targetNumber}` : `Sayang sekali. Angkanya adalah: ${targetNumber}`}
          </p>

          {isWin && (
            <div className="name-entry-area">
              <div style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-data)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Diselesaikan dalam {history.length} tebakan!</div>
              <input
                type="text"
                id="player-name"
                placeholder="MASUKKAN NAMA"
                maxLength={10}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                disabled={isSaved || isLoading}
              />
              <button
                className="btn btn-primary"
                onClick={handleSaveScore}
                disabled={isSaved || isLoading || !playerName}
                onMouseOver={() => playSound('select')}
              >
                {isSaved ? 'TERSREKAM!' : isLoading ? 'MENYIMPAN...' : 'SIMPAN REKOR'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '2rem' }}>
          <button className="btn btn-primary" onClick={() => showPage('page-difficulty')} onMouseOver={() => playSound('select')}>MAIN LAGI</button>
          <button className="btn" onClick={() => showPage('page-menu')} onMouseOver={() => playSound('select')}>MENU UTAMA</button>
        </div>
      </section>

      {/* Section: Leaderboard */}
      <section id="page-leaderboard" className={activePage === 'page-leaderboard' ? 'active' : ''}>
        <h1>JUARA.</h1>
        <p className="subtitle">&gt; TOP_5_PLAYERS</p>

        <div className="leaderboard-list">
          {isLoading ? (
            <div className="subtitle" style={{ textAlign: 'center', opacity: 0.5, marginTop: '2rem' }}>MEMUAT_DATA...</div>
          ) : leaderboard.length > 0 ? (
            leaderboard.map((score, idx) => (
              <div key={score.id || idx} className="score-entry">
                <div>
                  <span className="rank-tag">#{idx + 1}</span>
                  <span className="player-name-tag">{score.name}</span>
                </div>
                <span className="score-value">{score.attempts} TEBAK</span>
              </div>
            ))
          ) : (
            <div className="subtitle" style={{ textAlign: 'center', opacity: 0.5, marginTop: '2rem' }}>BELUM_ADA_REKOR</div>
          )}
        </div>

        <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => showPage('page-menu', true)} onMouseOver={() => playSound('select')}>KEMBALI KE MENU</button>
      </section>

      {/* Section: Login */}
      <section id="page-login" className={activePage === 'page-login' ? 'active' : ''}>
        <h1>LOGIN.</h1>
        <p className="subtitle">&gt; AKSES_KE_SISTEM</p>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="input-group">
            <label>USERNAME</label>
            <input name="username" type="text" placeholder="cyber_pilot_01" required />
          </div>
          <div className="input-group">
            <label>PASSWORD</label>
            <input name="password" type="password" placeholder="••••••••" required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onMouseOver={() => playSound('select')}>
            {isLoading ? 'OTENTIKASI...' : 'OTENTIKASI'}
          </button>
        </form>
      </section>
    </div>
  );
}
