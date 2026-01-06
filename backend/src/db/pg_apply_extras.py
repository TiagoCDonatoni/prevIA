from src.db.pg import pg_conn, pg_tx
from src.core.settings import BASE_DIR

FILES = [
    "sql/001b_raw_constraints.sql",
    "sql/004_backfill_checkpoint.sql",
]

def main():
    with pg_conn() as conn:
        with pg_tx(conn):
            with conn.cursor() as cur:
                for rel in FILES:
                    sql = (BASE_DIR / rel).read_text(encoding="utf-8")
                    for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
                        cur.execute(stmt + ";")
    print("OK: applied extras")

if __name__ == "__main__":
    main()
