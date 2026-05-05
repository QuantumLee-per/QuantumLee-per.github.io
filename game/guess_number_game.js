const DEFAULT_ATTEMPTS = 10;
const VALID_ATTEMPTS = [10, 15, 20];
const SKILL_LEVELS = {
  easy: 100,
  medium: 250,
  hard: 500,
};

const state = {
  secretNumber: 0,
  attemptsLeft: DEFAULT_ATTEMPTS,
  attemptsLimit: DEFAULT_ATTEMPTS,
  playerName: '',
  skillLevel: 'easy',
  maxRange: SKILL_LEVELS.easy,
  gameActive: false,
};

const elements = {};

function cacheElements() {
  elements.playerNameInput = document.getElementById('playerNameInput');
  elements.startButton = document.getElementById('startButton');
  elements.skillLevel = document.getElementById('skillLevel');
  elements.attemptsLimit = document.getElementById('attemptsLimit');
  elements.guessInput = document.getElementById('guessInput');
  elements.guessButton = document.getElementById('guessButton');
  elements.resetButton = document.getElementById('resetButton');
  elements.message = document.getElementById('message');
  elements.attempts = document.getElementById('attempts');
  elements.playerStatus = document.getElementById('playerStatus');
  elements.bestRecord = document.getElementById('bestRecord');
  elements.leaderboardBody = document.getElementById('leaderboardBody');
  elements.rangeDisplay = document.getElementById('rangeDisplay');
}

function updateMessage(text, tone = 'neutral') {
  elements.message.textContent = text;
  elements.message.dataset.tone = tone;
}

function setPlayerStatus(text) {
  elements.playerStatus.textContent = text;
}

function setAttemptsLeft(value) {
  elements.attempts.textContent = String(value);
}

function setRangeDisplay() {
  elements.rangeDisplay.textContent = `1 - ${state.maxRange}`;
  elements.guessInput.max = String(state.maxRange);
  elements.guessInput.placeholder = `Your guess (1-${state.maxRange})`;
}

function applySkillLevel() {
  const selected = elements.skillLevel.value;
  state.skillLevel = Object.hasOwn(SKILL_LEVELS, selected) ? selected : 'easy';
  state.maxRange = SKILL_LEVELS[state.skillLevel];
  setRangeDisplay();
}

function applyAttemptsLimit() {
  const selected = Number(elements.attemptsLimit.value);
  state.attemptsLimit = VALID_ATTEMPTS.includes(selected) ? selected : DEFAULT_ATTEMPTS;
}

function updateBestRecord(leaderboard) {
  const player = leaderboard.find((entry) => entry.player_name.toLowerCase() === state.playerName.toLowerCase());

  if (!player) {
    elements.bestRecord.textContent = 'No wins recorded yet for this player.';
    return;
  }

  const bestAttempts = player.best_attempts ?? 'n/a';
  const averageAttempts = player.average_attempts ?? 'n/a';
  elements.bestRecord.textContent = `${player.player_name}: ${player.wins} win(s), best ${bestAttempts} guess(es), average ${averageAttempts}`;
}

function renderLeaderboard(leaderboard) {
  if (!leaderboard.length) {
    elements.leaderboardBody.innerHTML = '<tr><td colspan="4" class="empty-state">No game history yet. Be the first player.</td></tr>';
    updateBestRecord([]);
    return;
  }

  elements.leaderboardBody.innerHTML = leaderboard
    .map((entry, index) => {
      const bestAttempts = entry.best_attempts ?? 'n/a';
      const averageAttempts = entry.average_attempts ?? 'n/a';
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${entry.player_name}</td>
          <td>${entry.wins}</td>
          <td>${bestAttempts} / ${averageAttempts}</td>
        </tr>
      `;
    })
    .join('');

  if (state.playerName) {
    updateBestRecord(leaderboard);
  }
}

async function loadLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) {
      throw new Error('Unable to load leaderboard');
    }

    const data = await response.json();
    renderLeaderboard(data.leaderboard || []);
  } catch (error) {
    elements.leaderboardBody.innerHTML = '<tr><td colspan="4" class="empty-state">Leaderboard unavailable right now.</td></tr>';
    elements.bestRecord.textContent = 'Unable to load best record information.';
  }
}

function resetRound() {
  state.secretNumber = Math.floor(Math.random() * state.maxRange) + 1;
  state.attemptsLeft = state.attemptsLimit;
  state.gameActive = true;

  elements.guessInput.value = '';
  elements.guessInput.disabled = false;
  elements.guessButton.disabled = false;
  setAttemptsLeft(state.attemptsLeft);
  updateMessage(`Welcome ${state.playerName}. Guess a number between 1 and ${state.maxRange}.`, 'info');
}

function finishRound(won) {
  state.gameActive = false;
  elements.guessInput.disabled = true;
  elements.guessButton.disabled = true;

  if (won) {
    updateMessage(`Correct. ${state.playerName} won with ${state.attemptsLimit - state.attemptsLeft} attempt(s).`, 'win');
  } else {
    updateMessage(`Game over. The number was ${state.secretNumber}.`, 'lose');
  }
}

async function submitResult(won) {
  try {
    const response = await fetch('/api/games', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        player_name: state.playerName,
        skill_level: state.skillLevel,
        attempts_limit: state.attemptsLimit,
        secret_number: state.secretNumber,
        attempts_used: state.attemptsLimit - state.attemptsLeft,
        won,
      }),
    });

    if (!response.ok) {
      throw new Error('Unable to save game result');
    }

    const data = await response.json();
    renderLeaderboard(data.leaderboard || []);
  } catch (error) {
    await loadLeaderboard();
  }
}

async function startSession() {
  const playerName = elements.playerNameInput.value.trim();

  if (!playerName) {
    updateMessage('Enter a player name before starting.', 'neutral');
    return;
  }

  state.playerName = playerName;
  setPlayerStatus(`Playing as ${state.playerName}`);
  resetRound();
  await loadLeaderboard();
}

async function checkGuess() {
  if (!state.gameActive) {
    updateMessage('Start a new round before guessing again.', 'neutral');
    return;
  }

  const guess = Number(elements.guessInput.value);

  if (!Number.isInteger(guess) || guess < 1 || guess > state.maxRange) {
    updateMessage(`Enter a whole number between 1 and ${state.maxRange}.`, 'neutral');
    return;
  }

  state.attemptsLeft -= 1;
  setAttemptsLeft(state.attemptsLeft);

  if (guess === state.secretNumber) {
    finishRound(true);
    await submitResult(true);
    return;
  }

  if (state.attemptsLeft === 0) {
    finishRound(false);
    await submitResult(false);
    return;
  }

  updateMessage(guess < state.secretNumber ? 'Too low. Try again.' : 'Too high. Try again.', 'neutral');
}

function wireEvents() {
  elements.startButton.addEventListener('click', startSession);
  elements.guessButton.addEventListener('click', checkGuess);
  elements.resetButton.addEventListener('click', resetRound);
  elements.skillLevel.addEventListener('change', () => {
    applySkillLevel();
    if (state.playerName) {
      resetRound();
    }
  });
  elements.attemptsLimit.addEventListener('change', () => {
    applyAttemptsLimit();
    if (state.playerName) {
      resetRound();
    } else {
      setAttemptsLeft(state.attemptsLimit);
    }
  });

  elements.playerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      startSession();
    }
  });

  elements.guessInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      checkGuess();
    }
  });
}

async function initialize() {
  cacheElements();
  applySkillLevel();
  applyAttemptsLimit();
  wireEvents();
  setAttemptsLeft(state.attemptsLimit);
  elements.guessInput.disabled = true;
  elements.guessButton.disabled = true;
  setPlayerStatus('Enter your name to begin.');
  updateMessage('Pick a player name to load the leaderboard and start guessing.', 'info');
  await loadLeaderboard();
}

document.addEventListener('DOMContentLoaded', initialize);
