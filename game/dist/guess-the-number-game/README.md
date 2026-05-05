# Game Backend Setup & Implementation Guide

## Prerequisite Software

Install the following software on the user's computer before setting up the game:

- Python 3.11 or newer
- A modern web browser such as Microsoft Edge, Google Chrome, or Firefox
- Optional: Node.js if you want to use `npm start` instead of running Python directly

## Installation Folder

Create a folder named `game` on the user's computer and place the project files inside it.

Example:

```text
C:\Users\<your-name>\Documents\game
```

## Python SQLite Backend

The game uses a Python backend in [app.py](C:\Users\lesli\Documents\GitHub\QuantumLee-per.github.io\QuantumLee-per\CS351-Web-Development\game\app.py). The backend:

- Serves the game web page and static assets
- Saves completed games into an SQLite database
- Returns leaderboard data for easy, medium, and hard games
- Calculates and stores the game score for leaderboard display

### Database Schema

The SQLite database file is `guess_history.db`. The main table is `game_history` and stores:

- `id`: unique row id
- `player_name`: player name
- `difficulty_level`: easy, medium, or hard
- `game_score`: score earned for the completed game
- `hint_used`: whether a hint was used
- `attempt_mode`: limited or unlimited
- `secret_number`: generated answer for the round
- `guesses_json`: saved list of guesses
- `attempts_used`: number of guesses taken
- `max_attempts`: allowed attempts for the round
- `won`: `1` for win, `0` for loss
- `played_at`: timestamp for the completed game

### Key Features

- SQLite storage built into Python with no extra database install required
- Automatic table creation and schema update on startup
- Separate leaderboard tables for easy, medium, and hard
- Score persistence for each completed game
- Static file hosting for the HTML, CSS, and JavaScript game files

## Installed Files And Contents

These are the main files used by the game after installation:

- `app.py`
  Python web server and SQLite backend for the live game
- `guess_number_game.html`
  The single HTML page used by the game
- `style_game.css`
  Page styling, layout, colors, and leaderboard table styling
- `game.js`
  Browser-side game logic, score calculation, hints, difficulty selection, and API calls
- `guess_history.db`
  SQLite database file created and updated by the backend
- `package.json`
  Optional startup scripts such as `npm start`
- `server.js`
  A guard file that tells users to run the Python backend instead of the old Node example server

Only one HTML file is used by the installed game: `guess_number_game.html`.

## How To Use

### 1. How to start backend server

Open a terminal, change into the `game` folder, and start the backend:

```bash
cd path/to/game
python app.py
```

### 2. How to run Python backend

If Python is installed correctly, the backend will start and print a local address similar to:

```text
Serving Guess the Number game at http://127.0.0.1:8010
```

You can also use:

```bash
npm start
```

That command runs `python app.py` from `package.json`.

### 3. How to open the browser

Open a browser and go to:

[http://127.0.0.1:8010](http://127.0.0.1:8010)

The game will load from the file `guess_number_game.html`.

### 4. How to play game

1. Enter a player name.
2. Choose a difficulty level: easy, medium, or hard.
3. Choose limited attempts or unlimited guesses.
4. If limited mode is selected, choose the number of chances.
5. Enter a guess and press `Guess`.
6. Use `Get Hint` if you want a clue, knowing it may reduce the score.
7. Continue until you win or run out of attempts.
8. Review the leaderboard tables to see saved results and game scores.
