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
    if (!wrapper) return;

    let glitchClass = 'glitch-active';
    if (type === 'error') glitchClass = 'glitch-error';
    else if (type === 'success') glitchClass = 'glitch-success';

    wrapper.classList.add(glitchClass);
    setTimeout(() => {
      wrapper.classList.remove(glitchClass);
    }, duration);
  }, []);

  const showPage = useCallback((page: Page, isBack = false) => {
    playSound(isBack ? 'transition2' : 'transition1');
    setActivePage(page);
    triggerGlitch();
    if (page === 'page-leaderboard') fetchLeaderboard();
    if (page === 'page-game') {
      setIsSaved(false);
      setPlayerName("");
    }
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
      <header className="absolute top-0 left-0 p-8 z-20">
        {activePage !== 'page-menu' && (
          <button
            className="back-btn visible"
            onClick={() => showPage('page-menu', true)}
            onMouseOver={() => playSound('select')}
          >
            Kembali
          </button>
        )}
      </header>

      {/* Menu */}
      {activePage === 'page-menu' && (
        <section className="active">
          <h1 className="text-5xl font-black mb-2 uppercase text-white leading-none">GUESS<br />IT.</h1>
          <p className="subtitle">&gt; ASAH_LOGIKA_&_INSTING</p>
          <div className="flex flex-col gap-3">
            <button className="btn btn-primary" onClick={() => showPage('page-difficulty')} onMouseOver={() => playSound('select')}>MULAI MAIN</button>
            <button className="btn" onClick={() => showPage('page-leaderboard')} onMouseOver={() => playSound('select')}>SKOR TERTINGGI</button>
            <button className="btn btn-small mt-4 opacity-60" onClick={() => showPage('page-login')} onMouseOver={() => playSound('select')}>LOGIN</button>
          </div>
        </section>
      )}

      {/* Difficulty */}
      {activePage === 'page-difficulty' && (
        <section className="active">
          <h1 className="text-4xl font-black mb-2 uppercase text-white">LEVEL.</h1>
          <p className="subtitle">&gt; PILIH_LEVEL</p>
          <div className="flex flex-col gap-3">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map(level => (
              <div key={level} className="diff-btn" onClick={() => startGame(level)} onMouseOver={() => playSound('select')}>
                <span className="diff-name uppercase">{level === 'easy' ? 'Mudah' : level === 'medium' ? 'Sedang' : 'Sulit'}</span>
                <span className="diff-info">1-{DIFFICULTIES[level].max} [{DIFFICULTIES[level].lives}_NYAWA]</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Game */}
      {activePage === 'page-game' && (
        <section className="active">
          <div className="bg-number absolute top-10 right-10 text-9xl font-black opacity-5 pointer-events-none text-white select-none">
            {targetNumber}
          </div>
          <div className="hearts-container flex gap-2 mb-6">
            {Array.from({ length: maxLives }).map((_, i) => (
              <svg key={i} className={`heart w-6 h-6 fill-[#ff00ff] ${i >= currentLives ? 'lost opacity-30 scale-75' : 'drop-shadow-[0_0_5px_#ff00ff]'}`} viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ))}
          </div>

          <div className="stat-row grid grid-cols-2 gap-px bg-white/10 border border-white/10 mb-8">
            <div className="stat-cell p-4 bg-[#0a0a0c] text-center">
              <span className="stat-label block font-mono text-[0.6rem] text-[#88888e] uppercase mb-1">RANGE_MIN</span>
              <span className="stat-value font-mono text-xl text-white">{minRange}</span>
            </div>
            <div className="stat-cell p-4 bg-[#0a0a0c] text-center">
              <span className="stat-label block font-mono text-[0.6rem] text-[#88888e] uppercase mb-1">RANGE_MAX</span>
              <span className="stat-value font-mono text-xl text-white">{maxRange}</span>
            </div>
          </div>

          <div className="feedback-area h-6 text-center font-mono text-[0.7rem] text-[#ff00ff] uppercase mb-4">
            {feedback || (history.length > 0 && `&gt; ${history[0] > targetNumber ? 'TERLALU_TINGGI' : 'TERLALU_RENDAH'}: TEBAK_${minRange}_KE_${maxRange}`)}
          </div>

          <div className="input-section relative mb-8">
            <input
              type="number"
              className="w-full bg-transparent border-none border-b-2 border-[#88888e] text-white font-mono text-8xl text-center py-4 outline-none focus:border-[#00f2ff] transition-colors"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && checkGuess()}
              autoFocus
            />
          </div>

          <button className="btn btn-primary w-full mb-8" onClick={checkGuess} onMouseOver={() => playSound('select')}>TEBAK ANGKA</button>

          <div className="history-bar flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {history.map((g, i) => (
              <span key={i} className="hist-tag shrink-0 px-2 py-1 bg-white/5 font-mono text-[0.7rem] text-[#88888e]">[{g}]</span>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      {activePage === 'page-result' && (
        <section className="active">
          <div className={`result-status text-6xl font-black mb-4 ${isWin ? 'text-[#00f2ff] drop-shadow-[0_0_20px_#00f2ff]' : 'text-[#ff3e00] drop-shadow-[0_0_20px_#ff3e00]'}`}>
            {isWin ? 'MENANG' : 'KALAH'}
          </div>
          <h1 className="text-initial text-white !-webkit-text-fill-color-initial">{isWin ? 'BERHASIL' : 'GAGAL'}</h1>
          <p className="subtitle !text-[#88888e] text-xs">
            &gt; {isWin ? `Kamu hebat! Angkanya adalah: ${targetNumber}` : `Sayang sekali. Angkanya adalah: ${targetNumber}`}
          </p>

          {isWin && (
            <div className="name-entry-area mt-6 flex flex-col gap-3 p-6 bg-[#00f2ff]/5 border border-dashed border-[#00f2ff]/20">
              <div className="text-[#00f2ff] font-mono text-xs">Diselesaikan dalam {history.length} tebakan!</div>
              <input
                type="text"
                className="w-full bg-[#0a0a0c] border border-white/10 p-3 text-[#00f2ff] font-mono text-center outline-none focus:border-[#00f2ff] focus:shadow-[0_0_15px_rgba(0,242,255,0.3)] tracking-[3px] disabled:opacity-50"
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

          <div className="flex flex-col gap-3 mt-8">
            <button className="btn btn-primary" onClick={() => showPage('page-difficulty')} disabled={isLoading} onMouseOver={() => playSound('select')}>MAIN LAGI</button>
            <button className="btn" onClick={() => showPage('page-menu')} disabled={isLoading} onMouseOver={() => playSound('select')}>MENU UTAMA</button>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      {activePage === 'page-leaderboard' && (
        <section className="active">
          <h1 className="text-4xl font-black mb-2 uppercase text-white">JUARA.</h1>
          <p className="subtitle">&gt; TOP_5_PLAYERS</p>

          <div className="leaderboard-list flex flex-col gap-2 mt-4 max-h-[300px] overflow-y-auto pr-2">
            {isLoading ? (
              <p className="subtitle text-center opacity-50 mt-8">MEMUAT_DATA...</p>
            ) : leaderboard.length > 0 ? (
              leaderboard.map((score, idx) => (
                <div key={score.id || idx} className="flex justify-between items-center p-3 border-b border-white/5 font-mono text-sm">
                  <span className="text-[#00f2ff]">{idx + 1}. {score.name}</span>
                  <span className="text-white opacity-60 uppercase">{score.attempts} TEBAKAN [{score.difficulty}]</span>
                </div>
              ))
            ) : (
              <p className="subtitle text-center opacity-50 mt-8">BELUM ADA REKOR</p>
            )}
          </div>

          <button className="btn btn-primary mt-8" onClick={() => showPage('page-menu')} onMouseOver={() => playSound('select')}>KEMBALI KE MENU</button>
        </section>
      )}

      {/* Login */}
      {activePage === 'page-login' && (
        <section className="active">
          <h1 className="text-4xl font-black mb-2 uppercase text-white">LOGIN.</h1>
          <p className="subtitle">&gt; AKSES_KE_SISTEM</p>

          <form className="login-form flex flex-col gap-6" onSubmit={handleLogin}>
            <div className="input-group flex flex-col gap-2">
              <label className="font-mono text-[0.65rem] text-[#88888e] tracking-wider">USERNAME</label>
              <input name="username" type="text" required className="bg-white/5 border border-white/10 p-4 text-white font-mono outline-none focus:border-[#00f2ff] focus:bg-[#00f2ff]/5 transition-all" placeholder="cyber_pilot_01" />
            </div>
            <div className="input-group flex flex-col gap-2">
              <label className="font-mono text-[0.65rem] text-[#88888e] tracking-wider">PASSWORD</label>
              <input name="password" type="password" required className="bg-white/5 border border-white/10 p-4 text-white font-mono outline-none focus:border-[#00f2ff] focus:bg-[#00f2ff]/5 transition-all" placeholder="••••••••" />
            </div>
            <button type="submit" className="btn btn-primary w-full mt-4" disabled={isLoading} onMouseOver={() => playSound('select')}>
              {isLoading ? 'OTENTIKASI...' : 'OTENTIKASI'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
