from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "game_history.db"
DEFAULT_PAGE = "guess_number_game.html"
VALID_SKILL_LEVELS = {"easy", "medium", "hard"}
VALID_ATTEMPT_LIMITS = {10, 15, 20}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS game_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                skill_level TEXT NOT NULL DEFAULT 'easy',
                attempts_limit INTEGER NOT NULL DEFAULT 10,
                secret_number INTEGER NOT NULL,
                attempts_used INTEGER NOT NULL,
                won INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        # Backward-compatible migration for databases created before skill levels existed.
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(game_history)").fetchall()
        }
        if "skill_level" not in columns:
            connection.execute(
                "ALTER TABLE game_history ADD COLUMN skill_level TEXT NOT NULL DEFAULT 'easy'"
            )

        if "attempts_limit" not in columns:
            connection.execute(
                "ALTER TABLE game_history ADD COLUMN attempts_limit INTEGER NOT NULL DEFAULT 10"
            )

        connection.commit()


def fetch_leaderboard(limit: int = 5) -> list[dict[str, object]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                player_name,
                COUNT(*) AS games_played,
                SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins,
                MIN(CASE WHEN won = 1 THEN attempts_used END) AS best_attempts,
                ROUND(AVG(CASE WHEN won = 1 THEN attempts_used END), 2) AS average_attempts
            FROM game_history
            GROUP BY player_name
            ORDER BY
                wins DESC,
                CASE WHEN best_attempts IS NULL THEN 999 ELSE best_attempts END ASC,
                games_played DESC,
                player_name ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]


def fetch_recent_history(limit: int = 20) -> list[dict[str, object]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT player_name, skill_level, attempts_limit, secret_number, attempts_used, won, created_at
            FROM game_history
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]


class GameRequestHandler(SimpleHTTPRequestHandler):
    def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", f"/{DEFAULT_PAGE}")
            self.end_headers()
            return

        if parsed.path == "/api/leaderboard":
            self._send_json({"leaderboard": fetch_leaderboard()})
            return

        if parsed.path == "/api/history":
            self._send_json({"history": fetch_recent_history()})
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path != "/api/games":
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        try:
            payload = self._read_json()
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON body")
            return

        player_name = str(payload.get("player_name", "")).strip()
        skill_level = str(payload.get("skill_level", "easy")).strip().lower()
        attempts_limit = int(payload.get("attempts_limit", 10))

        try:
            secret_number = int(payload.get("secret_number", 0))
            attempts_used = int(payload.get("attempts_used", 0))
        except (TypeError, ValueError):
            self.send_error(HTTPStatus.BAD_REQUEST, "secret_number and attempts_used must be integers")
            return

        won = 1 if bool(payload.get("won", False)) else 0

        if not player_name:
            self.send_error(HTTPStatus.BAD_REQUEST, "player_name is required")
            return

        if attempts_used <= 0:
            self.send_error(HTTPStatus.BAD_REQUEST, "attempts_used must be greater than zero")
            return

        if skill_level not in VALID_SKILL_LEVELS:
            self.send_error(HTTPStatus.BAD_REQUEST, "skill_level must be easy, medium, or hard")
            return

        if attempts_limit not in VALID_ATTEMPT_LIMITS:
            self.send_error(HTTPStatus.BAD_REQUEST, "attempts_limit must be 10, 15, or 20")
            return

        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO game_history (player_name, skill_level, attempts_limit, secret_number, attempts_used, won, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    player_name,
                    skill_level,
                    attempts_limit,
                    secret_number,
                    attempts_used,
                    won,
                    utc_now(),
                ),
            )
            connection.commit()

        self._send_json(
            {
                "message": "Game result saved",
                "leaderboard": fetch_leaderboard(),
                "history": fetch_recent_history(10),
            },
            status=HTTPStatus.CREATED,
        )


def main() -> None:
    init_db()
    handler = partial(GameRequestHandler, directory=str(BASE_DIR))
    server = ThreadingHTTPServer(("0.0.0.0", 8000), handler)
    print("Serving the game on http://localhost:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
