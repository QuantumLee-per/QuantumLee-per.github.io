# Guess The Number Challenge

This folder supports two use cases:

- A GitHub Pages frontend demo using `guess_number_game.html`, `game.js`, and `style_game.css`.
- A full local install using `app.py` for the Python + SQLite backend.

## GitHub Pages Demo

GitHub Pages can host the frontend-only version of the game so visitors can open the URL and try the interface without running Python locally. In demo mode, the game uses browser `localStorage` for temporary score history instead of the SQLite backend.

Pages entry path:

- `index.html` at the repository root redirects to `game/guess_number_game.html`
- `game/guess_number_game.html` is the only HTML game page used by the demo

## Full Local Version

The full web app keeps persistent play history and leaderboards through the Python backend in `app.py` and the SQLite database created locally when the backend runs.

Main files:

- `app.py`: Serves the game, accepts completed game results, and stores play history in SQLite.
- `guess_number_game.html`: Main game page.
- `game.js`: Gameplay, score handling, leaderboard rendering, and demo-mode fallback logic.
- `style_game.css`: Page styling and layout.
- `package.json`: Convenience scripts for starting the Python backend.
- `server.js`: Legacy helper that tells users to run the Python backend instead.
- `dist/guess-the-number-game-cross-platform.zip`: Downloadable install bundle for Windows, macOS, and Linux.

## Local Run Steps

1. Open a terminal in this `game` folder.
2. Run `python app.py`.
3. Open `http://127.0.0.1:8010`.
4. Enter a player name, pick a difficulty, choose limited or unlimited attempts, and play.
