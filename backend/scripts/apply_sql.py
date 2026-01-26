import sys
from pathlib import Path

# garante que o root do backend entre no sys.path (para importar "src.*")
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.db.pg import pg_conn  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/apply_sql.py <path_to_sql_file>")
        return 2

    sql_path = (BACKEND_DIR / sys.argv[1]).resolve() if not Path(sys.argv[1]).is_absolute() else Path(sys.argv[1])
    if not sql_path.exists():
        print(f"ERROR: SQL file not found: {sql_path}")
        return 2

    sql = sql_path.read_text(encoding="utf-8")

    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()

    print(f"OK: applied {sql_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
