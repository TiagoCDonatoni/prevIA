import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.db.pg import pg_conn

with pg_conn() as conn:
    with conn.cursor() as cur:
        cur.execute("""
            select
              current_database(),
              inet_server_addr()::text,
              inet_server_port(),
              to_regclass('odds.odds_league_map'),
              to_regclass('odds.audit_predictions'),
              to_regclass('odds.audit_result')
        """)
        print(cur.fetchone())