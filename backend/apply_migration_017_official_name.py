from pathlib import Path

from src.db.pg import pg_conn

BASE_DIR = Path(__file__).resolve().parent
SQL_PATH = BASE_DIR / "migrations" / "017_odds_league_map_add_official_name.sql"

sql = SQL_PATH.read_text(encoding="utf-8")

with pg_conn() as conn:
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()

print("Migration aplicada com sucesso.")