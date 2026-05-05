import json
import sqlite3
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "guess_history.db"
HOST = "127.0.0.1"
PORT = 8010


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def calculate_game_score(difficulty_level, attempts_used, max_attempts, won, hint_used=False, attempt_mode="limited"):
    multipliers = {"easy": 1, "medium": 2, "hard": 3}
    hint_penalty = -5 if hint_used else 0

    if not won:
        return hint_penalty - 10

    bonus_base = multipliers[difficulty_level] * 25
    if attempt_mode == "unlimited":
        attempt_bonus = max(40 - attempts_used, 5)
    else:
        attempt_bonus = max(max_attempts - attempts_used, 0) * 4

    return hint_penalty + bonus_base + attempt_bonus


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS game_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                difficulty_level TEXT NOT NULL DEFAULT 'medium',
                game_score INTEGER NOT NULL DEFAULT 0,
                hint_used INTEGER NOT NULL DEFAULT 0,
                attempt_mode TEXT NOT NULL DEFAULT 'limited',
                secret_number INTEGER NOT NULL,
                guesses_json TEXT NOT NULL,
                attempts_used INTEGER NOT NULL,
                max_attempts INTEGER NOT NULL,
                won INTEGER NOT NULL,
                played_at TEXT NOT NULL
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(game_history)").fetchall()
        }
        if "difficulty_level" not in columns:
            connection.execute(
                "ALTER TABLE game_history ADD COLUMN difficulty_level TEXT NOT NULL DEFAULT 'medium'"
            )
        if "game_score" not in columns:
            connection.execute(
                "ALTER TABLE game_history ADD COLUMN game_score INTEGER NOT NULL DEFAULT 0"
            )
        if "hint_used" not in columns:
            connection.execute(
                "ALTER TABLE game_history ADD COLUMN hint_used INTEGER NOT NULL DEFAULT 0"
            )
        if "attempt_mode" not in columns:
            connection.execute(
                "ALTER TABLE game_history ADD COLUMN attempt_mode TEXT NOT NULL DEFAULT 'limited'"
            )

        # Backfill older zero-score rows using the game scoring rules.
        connection.execute(
            """
            UPDATE game_history
            SET game_score = CASE
                WHEN won = 0 THEN (CASE WHEN hint_used = 1 THEN -15 ELSE -10 END)
                WHEN attempt_mode = 'unlimited' THEN
                    ((CASE difficulty_level
                        WHEN 'easy' THEN 25
                        WHEN 'medium' THEN 50
                        WHEN 'hard' THEN 75
                        ELSE 50
                    END)
                    + (CASE WHEN 40 - attempts_used > 5 THEN 40 - attempts_used ELSE 5 END)
                    + (CASE WHEN hint_used = 1 THEN -5 ELSE 0 END))
                ELSE
                    ((CASE difficulty_level
                        WHEN 'easy' THEN 25
                        WHEN 'medium' THEN 50
                        WHEN 'hard' THEN 75
                        ELSE 50
                    END)
                    + (CASE WHEN max_attempts - attempts_used > 0 THEN (max_attempts - attempts_used) * 4 ELSE 0 END)
                    + (CASE WHEN hint_used = 1 THEN -5 ELSE 0 END))
            END
            WHERE game_score = 0
            """
        )


class GuessGameHandler(BaseHTTPRequestHandler):
    static_files = {
        "/": ("guess_number_game.html", "text/html; charset=utf-8"),
        "/guess_number_game.html": ("guess_number_game.html", "text/html; charset=utf-8"),
        "/style_game.css": ("style_game.css", "text/css; charset=utf-8"),
        "/game.js": ("game.js", "application/javascript; charset=utf-8"),
    }

    def do_GET(self):
        parsed_url = urlparse(self.path)

        if parsed_url.path in self.static_files:
            self.serve_static_file(parsed_url.path)
            return

        if parsed_url.path == "/api/leaderboard":
            self.send_json(self.fetch_leaderboard())
            return

        if parsed_url.path == "/api/player-stats":
            params = parse_qs(parsed_url.query)
            player_name = params.get("name", [""])[0].strip()
            self.send_json(self.fetch_player_stats(player_name))
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Route not found.")

    def do_POST(self):
        if self.path != "/api/games":
            self.send_error(HTTPStatus.NOT_FOUND, "Route not found.")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
            self.store_game(payload)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            self.send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"message": "Game saved successfully."}, status=HTTPStatus.CREATED)

    def serve_static_file(self, route_path):
        file_name, content_type = self.static_files[route_path]
        file_path = BASE_DIR / file_name

        if not file_path.exists():
          self.send_error(HTTPStatus.NOT_FOUND, "File not found.")
          return

        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def store_game(self, payload):
        player_name = str(payload["player_name"]).strip()
        difficulty_level = str(payload["difficulty_level"]).strip().lower()
        hint_used = bool(payload.get("hint_used", False))
        attempt_mode = str(payload.get("attempt_mode", "limited")).strip().lower()
        guesses = payload["guesses"]
        attempts_used = int(payload["attempts_used"])
        max_attempts = int(payload["max_attempts"])
        secret_number = int(payload["secret_number"])
        won = 1 if bool(payload["won"]) else 0
        game_score = int(
            payload.get(
                "game_score",
                calculate_game_score(
                    difficulty_level,
                    attempts_used,
                    max_attempts,
                    bool(won),
                    hint_used,
                    attempt_mode,
                ),
            )
        )

        if not player_name:
            raise ValueError("Player name is required.")

        if difficulty_level not in {"easy", "medium", "hard"}:
            raise ValueError("Difficulty level is invalid.")

        if attempt_mode not in {"limited", "unlimited"}:
            raise ValueError("Attempt mode is invalid.")

        if not isinstance(guesses, list) or not guesses:
            raise ValueError("Guesses must contain at least one number.")

        if attempts_used < 1 or attempts_used > max_attempts:
            raise ValueError("Attempts used is out of range.")

        played_at = datetime.now().isoformat(timespec="seconds")

        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO game_history (
                    player_name,
                    difficulty_level,
                    game_score,
                    hint_used,
                    attempt_mode,
                    secret_number,
                    guesses_json,
                    attempts_used,
                    max_attempts,
                    won,
                    played_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    player_name,
                    difficulty_level,
                    game_score,
                    1 if hint_used else 0,
                    attempt_mode,
                    secret_number,
                    json.dumps(guesses),
                    attempts_used,
                    max_attempts,
                    won,
                    played_at,
                ),
            )

    def fetch_leaderboard(self):
        leaderboard = {}
        with get_connection() as connection:
            for level in ("easy", "medium", "hard"):
                rows = connection.execute(
                    """
                    SELECT
                        player_name,
                        difficulty_level,
                        game_score,
                        max_attempts AS allowed_attempts,
                        attempts_used AS guesses_count
                    FROM game_history
                    WHERE won = 1 AND difficulty_level = ?
                    ORDER BY attempts_used ASC, game_score DESC, max_attempts ASC, played_at ASC, player_name COLLATE NOCASE ASC
                    LIMIT 5
                    """,
                    (level,),
                ).fetchall()
                leaderboard[level] = [dict(row) for row in rows]

        return leaderboard

    def fetch_player_stats(self, player_name):
        if not player_name:
            return {
                "player_name": "",
                "games_played": 0,
                "total_wins": 0,
                "best_attempts": None,
                "last_played": "N/A",
            }

        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT
                    COUNT(*) AS games_played,
                    SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS total_wins,
                    MIN(CASE WHEN won = 1 THEN attempts_used END) AS best_attempts,
                    MAX(played_at) AS last_played
                FROM game_history
                WHERE LOWER(player_name) = LOWER(?)
                """,
                (player_name,),
            ).fetchone()

        return {
            "player_name": player_name,
            "games_played": row["games_played"] or 0,
            "total_wins": row["total_wins"] or 0,
            "best_attempts": row["best_attempts"],
            "last_played": row["last_played"] or "N/A",
        }

    def send_json(self, payload, status=HTTPStatus.OK):
        response = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), GuessGameHandler)
    print(f"Serving Guess the Number game at http://{HOST}:{PORT}")
    server.serve_forever()
