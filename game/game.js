const difficultyConfig = {
  easy: { label: "Easy", min: 1, max: 50, scoreMultiplier: 1 },
  medium: { label: "Medium", min: 1, max: 100, scoreMultiplier: 2 },
  hard: { label: "Hard", min: 1, max: 250, scoreMultiplier: 3 }
};

const DEMO_HISTORY_KEY = "guessGameDemoHistoryV1";
let currentPlayerName = "";
let currentScore = 0;
let currentGuesses = [];
let secretNumber = 0;
let attemptsLeft = 0;
let maxAttempts = 0;
let roundCompleted = false;
let hintUsed = false;
let selectedDifficulty = difficultyConfig.medium;
let attemptMode = "limited";
let currentRoundScore = 0;
let backendAvailable = true;

const playerNameInput = document.getElementById("playerName");
const difficultySelect = document.getElementById("difficultySelect");
const attemptModeSelect = document.getElementById("attemptMode");
const attemptCountSelect = document.getElementById("attemptCount");
const guessInput = document.getElementById("guessInput");
const currentPlayerEl = document.getElementById("currentPlayer");
const rangeDisplayEl = document.getElementById("rangeDisplay");
const attemptsEl = document.getElementById("attempts");
const scoreDisplayEl = document.getElementById("scoreDisplay");
const hintTextEl = document.getElementById("hintText");
const messageEl = document.getElementById("message");
const guessHistoryEl = document.getElementById("guessHistory");
const playerStatsEl = document.getElementById("playerStats");
const leaderboardElements = {
  easy: document.getElementById("leaderboardEasy"),
  medium: document.getElementById("leaderboardMedium"),
  hard: document.getElementById("leaderboardHard")
};
const guessButton = document.getElementById("guessButton");
const hintButton = document.getElementById("hintButton");

function setMessage(text, color = "#1f1d1c") {
  messageEl.textContent = text;
  messageEl.style.color = color;
}

function readDemoHistory() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_HISTORY_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function writeDemoHistory(rows) {
  localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(rows));
}

function buildDemoLeaderboard(rows) {
  const output = { easy: [], medium: [], hard: [] };
  ["easy", "medium", "hard"].forEach((level) => {
    output[level] = rows
      .filter((row) => row.won && row.difficulty_level === level)
      .sort((a, b) => {
        if (b.game_score !== a.game_score) {
          return b.game_score - a.game_score;
        }
        if (a.guesses_count !== b.guesses_count) {
          return a.guesses_count - b.guesses_count;
        }
        return a.player_name.localeCompare(b.player_name);
      })
      .slice(0, 5);
  });
  return output;
}

function buildDemoPlayerStats(playerName, rows) {
  const playerRows = rows.filter((row) => row.player_name.toLowerCase() === playerName.toLowerCase());
  const wins = playerRows.filter((row) => row.won);
  const bestWin = wins.sort((a, b) => a.guesses_count - b.guesses_count)[0];
  const lastPlayed = playerRows[playerRows.length - 1];

  return {
    games_played: playerRows.length,
    total_wins: wins.length,
    best_attempts: bestWin ? bestWin.guesses_count : null,
    last_played: lastPlayed ? lastPlayed.played_at : "N/A"
  };
}

async function apiFetch(url, options) {
  if (!backendAvailable) {
    throw new Error("Backend unavailable");
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response;
  } catch (error) {
    backendAvailable = false;
    return null;
  }
}

function refreshModeControls() {
  attemptMode = attemptModeSelect.value;
  attemptCountSelect.disabled = attemptMode === "unlimited";
}

function getSelectedMaxAttempts() {
  if (attemptMode === "unlimited") {
    return Number.POSITIVE_INFINITY;
  }
  return Number(attemptCountSelect.value);
}

function updateCurrentPlayer(name) {
  currentPlayerName = name.trim();
  currentPlayerEl.textContent = currentPlayerName || "Not set";

  if (currentPlayerName) {
    localStorage.setItem("guessGamePlayerName", currentPlayerName);
    loadPlayerStats(currentPlayerName);
  } else {
    localStorage.removeItem("guessGamePlayerName");
    playerStatsEl.textContent = "Enter your player name to load saved results.";
  }
}

function requirePlayerName() {
  if (currentPlayerName) {
    return true;
  }

  const typedName = playerNameInput.value.trim();
  if (!typedName) {
    setMessage("Enter your player name before starting the game.", "#9e2f24");
    playerNameInput.focus();
    return false;
  }

  updateCurrentPlayer(typedName);
  return true;
}

function startGame() {
  selectedDifficulty = difficultyConfig[difficultySelect.value];
  refreshModeControls();
  maxAttempts = getSelectedMaxAttempts();
  attemptsLeft = maxAttempts;
  currentGuesses = [];
  roundCompleted = false;
  hintUsed = false;
  currentRoundScore = 0;

  secretNumber = Math.floor(Math.random() * (selectedDifficulty.max - selectedDifficulty.min + 1)) + selectedDifficulty.min;
  rangeDisplayEl.textContent = `${selectedDifficulty.min} - ${selectedDifficulty.max}`;
  attemptsEl.textContent = Number.isFinite(attemptsLeft) ? attemptsLeft : "Unlimited";
  hintTextEl.textContent = "Use the hint button when you need a clue.";
  guessHistoryEl.textContent = "None";
  guessInput.value = "";
  guessInput.min = selectedDifficulty.min;
  guessInput.max = selectedDifficulty.max;
  guessInput.disabled = false;
  guessButton.disabled = false;
  hintButton.disabled = false;
  setMessage(
    backendAvailable
      ? `New ${selectedDifficulty.label.toLowerCase()} round started.`
      : `New ${selectedDifficulty.label.toLowerCase()} round started in demo mode.`,
    "#1f1d1c"
  );
}

function updateScore(points) {
  currentScore += points;
  currentRoundScore += points;
  scoreDisplayEl.textContent = currentScore;
}

function getRoundScoreForOutcome(won) {
  const hintPenalty = hintUsed ? -5 : 0;

  if (!won) {
    return hintPenalty - 10;
  }

  const bonusBase = selectedDifficulty.scoreMultiplier * 25;
  const attemptBonus = Number.isFinite(maxAttempts)
    ? Math.max(attemptsLeft, 0) * 4
    : Math.max(40 - getAttemptsUsed(), 5);

  return hintPenalty + bonusBase + attemptBonus;
}

function finalizeRoundScore(won) {
  const calculatedRoundScore = getRoundScoreForOutcome(won);
  const scoreDelta = calculatedRoundScore - currentRoundScore;
  updateScore(scoreDelta);
}

function createHint() {
  const midpoint = Math.floor((selectedDifficulty.min + selectedDifficulty.max) / 2);
  if (secretNumber === midpoint) {
    return "The secret number sits exactly in the middle of the range.";
  }

  const parityHint = secretNumber % 2 === 0 ? "even" : "odd";
  const sideHint = secretNumber > midpoint ? "upper half" : "lower half";
  return `The number is ${parityHint} and it is in the ${sideHint} of the range.`;
}

function handleHint() {
  if (roundCompleted) {
    return;
  }

  if (hintUsed) {
    setMessage("You already used the hint for this round.", "#7b5526");
    return;
  }

  hintUsed = true;
  hintTextEl.textContent = createHint();
  setMessage("Hint revealed. A small score penalty was applied.", "#7b5526");
  updateScore(-5);
}

function getAttemptsUsed() {
  return currentGuesses.length;
}

async function saveCompletedGame(won) {
  const effectiveMaxAttempts = Number.isFinite(maxAttempts) ? maxAttempts : getAttemptsUsed();

  const payload = {
    player_name: currentPlayerName,
    difficulty_level: difficultySelect.value,
    game_score: currentRoundScore,
    hint_used: hintUsed,
    attempt_mode: attemptMode,
    secret_number: secretNumber,
    guesses: currentGuesses,
    attempts_used: getAttemptsUsed(),
    max_attempts: effectiveMaxAttempts,
    won
  };

  const response = await apiFetch("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response) {
    return;
  }

  const rows = readDemoHistory();
  rows.push({
    player_name: payload.player_name,
    difficulty_level: payload.difficulty_level,
    allowed_attempts: payload.max_attempts,
    guesses_count: payload.attempts_used,
    game_score: payload.game_score,
    won: payload.won,
    played_at: new Date().toLocaleString()
  });
  writeDemoHistory(rows);
}

async function finishRound(won) {
  roundCompleted = true;
  guessInput.disabled = true;
  guessButton.disabled = true;
  hintButton.disabled = true;

  try {
    await saveCompletedGame(won);
    await Promise.all([loadLeaderboard(), loadPlayerStats(currentPlayerName)]);
  } catch (error) {
    setMessage(`${messageEl.textContent} Game history could not be saved.`, "#9e2f24");
  }
}

async function checkGuess() {
  if (!requirePlayerName() || roundCompleted) {
    return;
  }

  const guess = Number(guessInput.value);
  if (!guess || guess < selectedDifficulty.min || guess > selectedDifficulty.max) {
    setMessage(`Enter a number from ${selectedDifficulty.min} to ${selectedDifficulty.max}.`, "#9e2f24");
    return;
  }

  currentGuesses.push(guess);
  guessHistoryEl.textContent = currentGuesses.join(", ");

  if (Number.isFinite(attemptsLeft)) {
    attemptsLeft -= 1;
    attemptsEl.textContent = attemptsLeft;
  } else {
    attemptsEl.textContent = "Unlimited";
  }

  if (guess === secretNumber) {
    finalizeRoundScore(true);
    setMessage(`Correct! You found the number in ${getAttemptsUsed()} guesses.`, "#1f7a3a");
    await finishRound(true);
    return;
  }

  if (guess < secretNumber) {
    setMessage("Too low. Try a higher number.", "#1f1d1c");
  } else {
    setMessage("Too high. Try a lower number.", "#1f1d1c");
  }

  if (Number.isFinite(attemptsLeft) && attemptsLeft <= 0) {
    finalizeRoundScore(false);
    setMessage(`Out of chances. The number was ${secretNumber}.`, "#9e2f24");
    await finishRound(false);
    return;
  }

  guessInput.value = "";
  guessInput.focus();
}

async function loadLeaderboard() {
  const response = await apiFetch("/api/leaderboard");

  if (response) {
    const data = await response.json();
    ["easy", "medium", "hard"].forEach((level) => {
      renderLeaderboardTable(leaderboardElements[level], data[level] || []);
    });
    return;
  }

  const demoData = buildDemoLeaderboard(readDemoHistory());
  ["easy", "medium", "hard"].forEach((level) => {
    renderLeaderboardTable(leaderboardElements[level], demoData[level] || []);
  });
}

function renderLeaderboardTable(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="leaderboard-empty">No records yet.</p>';
    return;
  }

  container.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Skill Level</th>
          <th>Allowed Attempts</th>
          <th>Guesses Count</th>
          <th>Game Score</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((entry) => `
          <tr>
            <td>${entry.player_name}</td>
            <td>${entry.difficulty_level}</td>
            <td>${entry.allowed_attempts}</td>
            <td>${entry.guesses_count}</td>
            <td>${Number.isFinite(Number(entry.game_score)) ? Number(entry.game_score) : 0}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadPlayerStats(playerName) {
  if (!playerName) {
    return;
  }

  const response = await apiFetch(`/api/player-stats?name=${encodeURIComponent(playerName)}`);

  if (response) {
    const data = await response.json();
    if (!data.games_played) {
      playerStatsEl.textContent = "No saved games yet for this player.";
      return;
    }

    playerStatsEl.innerHTML = [
      `Games played: ${data.games_played}<br>`,
      `Wins: ${data.total_wins}<br>`,
      `Best winning record: ${data.best_attempts ? `${data.best_attempts} guesses` : "No wins yet"}<br>`,
      `Last played: ${data.last_played}`
    ].join("");
    return;
  }

  const data = buildDemoPlayerStats(playerName, readDemoHistory());
  if (!data.games_played) {
    playerStatsEl.textContent = "No saved games yet for this player.";
    return;
  }

  playerStatsEl.innerHTML = [
    `Games played: ${data.games_played}<br>`,
    `Wins: ${data.total_wins}<br>`,
    `Best winning record: ${data.best_attempts ? `${data.best_attempts} guesses` : "No wins yet"}<br>`,
    `Last played: ${data.last_played}`
  ].join("");
}

function handleSavePlayer() {
  updateCurrentPlayer(playerNameInput.value);
  if (currentPlayerName) {
    setMessage(
      backendAvailable
        ? `Player saved as ${currentPlayerName}.`
        : `Player saved as ${currentPlayerName}. Demo mode is active.`,
      "#1f1d1c"
    );
  }
}

document.getElementById("savePlayerButton").addEventListener("click", handleSavePlayer);
document.getElementById("guessButton").addEventListener("click", checkGuess);
document.getElementById("hintButton").addEventListener("click", handleHint);
document.getElementById("resetButton").addEventListener("click", startGame);

difficultySelect.addEventListener("change", startGame);
attemptModeSelect.addEventListener("change", startGame);
attemptCountSelect.addEventListener("change", startGame);

playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleSavePlayer();
  }
});

guessInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    checkGuess();
  }
});

async function initializePage() {
  refreshModeControls();
  scoreDisplayEl.textContent = currentScore;

  const savedPlayerName = localStorage.getItem("guessGamePlayerName");
  if (savedPlayerName) {
    playerNameInput.value = savedPlayerName;
    updateCurrentPlayer(savedPlayerName);
  }

  startGame();
  await loadLeaderboard();
}

initializePage();
