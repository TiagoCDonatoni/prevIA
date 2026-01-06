from __future__ import annotations

from src.db.pg import pg_conn


def print_table_columns(schema: str, table: str) -> None:
    sql = """
    select column_name, data_type
    from information_schema.columns
    where table_schema = %s and table_name = %s
    order by ordinal_position
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (schema, table))
        for name, dtype in cur.fetchall():
            print(f"{name} ({dtype})")


def print_table_columns_filtered(schema: str, table: str) -> None:
    sql = """
    select column_name, data_type
    from information_schema.columns
    where table_schema = %s
      and table_name = %s
      and (
        column_name ilike '%%goal%%' or
        column_name ilike '%%score%%' or
        column_name ilike '%%status%%' or
        column_name ilike '%%result%%'
      )
    order by column_name
    """
    with pg_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (schema, table))
        rows = cur.fetchall()
        for name, dtype in rows:
            print(f"{name} ({dtype})")


if __name__ == "__main__":
    print_table_columns("core", "fixtures")
