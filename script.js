(() => {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  const MIN = 1;
  const MAX = 100;
  const STORAGE_KEY = 'gtn_best';

  // ── DOM refs ─────────────────────────────────────────────────────
  const guessInput    = document.getElementById('guess-input');
  const guessBtn      = document.getElementById('guess-btn');
  const resetBtn      = document.getElementById('reset-btn');
  const messageEl     = document.getElementById('message');
  const attemptEl     = document.getElementById('attempt-count');
  const bestEl        = document.getElementById('best-score');
  const hintFill      = document.getElementById('hint-fill');
  const hintLabel     = document.getElementById('hint-label');
  const historyList   = document.getElementById('history');

  // ── State ────────────────────────────────────────────────────────
  let secret;
  let attempts;
  let gameOver;

  // ── Helpers ──────────────────────────────────────────────────────
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function loadBest() {
    const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    return isNaN(v) ? null : v;
  }

  function saveBest(score) {
    const prev = loadBest();
    if (prev === null || score < prev) {
      localStorage.setItem(STORAGE_KEY, score);
      return true;
    }
    return false;
  }

  function renderBest() {
    const b = loadBest();
    bestEl.textContent = b !== null ? b : '—';
  }

  function setMessage(text, cls) {
    messageEl.textContent = text;
    messageEl.className = 'message ' + (cls || '');
  }

  /** Update the proximity bar (0 % = far, 100 % = exact). */
  function updateHint(guess) {
    const distance = Math.abs(secret - guess);
    const maxDist  = MAX - MIN;                   // 99
    const proximity = Math.round((1 - distance / maxDist) * 100);
    hintFill.style.width = proximity + '%';

    if (distance === 0) {
      hintLabel.textContent = '🎯 Spot on!';
    } else if (distance <= 5) {
      hintLabel.textContent = '🔥 Burning hot!';
    } else if (distance <= 15) {
      hintLabel.textContent = '♨️  Very warm';
    } else if (distance <= 30) {
      hintLabel.textContent = '🌡️  Warm';
    } else if (distance <= 50) {
      hintLabel.textContent = '❄️  Cold';
    } else {
      hintLabel.textContent = '🧊 Freezing!';
    }
  }

  function addHistory(guess, cls) {
    const li = document.createElement('li');
    li.textContent = guess;
    li.className   = cls;
    historyList.appendChild(li);
  }

  // ── Init / reset ─────────────────────────────────────────────────
  function startGame() {
    secret   = randInt(MIN, MAX);
    attempts = 0;
    gameOver = false;

    guessInput.value   = '';
    guessInput.disabled = false;
    guessBtn.disabled  = false;
    resetBtn.hidden    = true;
    historyList.innerHTML = '';

    hintFill.style.width  = '0%';
    hintLabel.textContent = '';

    attemptEl.textContent = '0';
    setMessage('Make your first guess!', '');
    renderBest();
    guessInput.focus();
  }

  // ── Core guess logic ─────────────────────────────────────────────
  function handleGuess() {
    if (gameOver) return;

    const raw   = guessInput.value.trim();
    const guess = parseInt(raw, 10);

    if (!raw || isNaN(guess) || guess < MIN || guess > MAX) {
      setMessage(`Please enter a whole number between ${MIN} and ${MAX}.`, 'invalid');
      guessInput.select();
      return;
    }

    attempts++;
    attemptEl.textContent = attempts;
    updateHint(guess);

    if (guess < secret) {
      setMessage(`📉 Too low! Try a higher number.`, 'too-low');
      addHistory(guess, 'low');
    } else if (guess > secret) {
      setMessage(`📈 Too high! Try a lower number.`, 'too-high');
      addHistory(guess, 'high');
    } else {
      // Correct!
      const isNewBest = saveBest(attempts);
      renderBest();

      const msg = attempts === 1
        ? `🏆 First try! The number was ${secret}.`
        : `🎉 Correct! You got it in ${attempts} attempt${attempts > 1 ? 's' : ''}!${isNewBest ? ' 🌟 New best!' : ''}`;

      setMessage(msg, 'correct');
      addHistory(guess, 'win');
      gameOver = true;
      guessInput.disabled = true;
      guessBtn.disabled   = true;
      resetBtn.hidden     = false;
      resetBtn.focus();
    }

    guessInput.value = '';
    if (!gameOver) guessInput.focus();
  }

  // ── Event listeners ──────────────────────────────────────────────
  guessBtn.addEventListener('click', handleGuess);

  guessInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGuess();
  });

  resetBtn.addEventListener('click', startGame);

  // ── Kick off ─────────────────────────────────────────────────────
  startGame();
})();
