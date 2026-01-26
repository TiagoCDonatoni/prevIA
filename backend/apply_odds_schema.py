from src.db.pg import pg_conn
import pathlib

sql = pathlib.Path("scripts/ddl_odds_schema_v1.sql").read_text(encoding="utf-8")

with pg_conn() as conn:
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()

print("OK: odds schema v1 applied")
