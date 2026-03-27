from src.db.pg import pg_conn

sql = """
ALTER TABLE odds.odds_league_map
  ADD COLUMN IF NOT EXISTS artifact_filename TEXT NULL;

ALTER TABLE odds.odds_league_map
  ADD COLUMN IF NOT EXISTS model_version TEXT NULL;
"""

with pg_conn() as conn:
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()

print("Migration aplicada com sucesso.")