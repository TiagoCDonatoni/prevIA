from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.db.pg import pg_conn

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/db-status")
def db_status():
    try:
        steps = []
        steps.append("opening_pg_conn")
        with pg_conn() as conn:
            steps.append("opened_pg_conn")

            with conn.cursor() as cur:
                steps.append("query_raw")
                cur.execute("select count(*) from raw.api_responses")
                raw_count = cur.fetchone()[0]

                steps.append("query_leagues")
                cur.execute("select count(*) from core.leagues")
                leagues = cur.fetchone()[0]

                steps.append("query_teams")
                cur.execute("select count(*) from core.teams")
                teams = cur.fetchone()[0]

                steps.append("query_fixtures")
                cur.execute("select count(*) from core.fixtures")
                fixtures = cur.fetchone()[0]

        steps.append("done")

        return {
            "ok": True,
            "steps": steps,
            "raw": {"api_responses": raw_count},
            "core": {"leagues": leagues, "teams": teams, "fixtures": fixtures},
        }

    except Exception as ex:
        return JSONResponse(
            status_code=200,
            content={"ok": False, "steps": locals().get("steps", []), "error": str(ex)},
        )


@router.get("/pg-whoami")
def pg_whoami():
    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      current_database() as current_database,
                      current_user as current_user,
                      inet_server_addr()::text as server_addr,
                      inet_server_port() as server_port,
                      version() as server_version
                    """
                )
                row = cur.fetchone()

                cur.execute("select count(*) from app.users")
                users_count = cur.fetchone()[0]

                cur.execute("select count(*) from auth.sessions")
                sessions_count = cur.fetchone()[0]

                cur.execute(
                    """
                    select user_id, email, created_at_utc
                    from app.users
                    order by user_id desc
                    limit 5
                    """
                )
                latest_users = [
                    {
                        "user_id": r[0],
                        "email": r[1],
                        "created_at_utc": str(r[2]),
                    }
                    for r in cur.fetchall()
                ]

        return {
            "ok": True,
            "postgres": {
                "current_database": row[0],
                "current_user": row[1],
                "server_addr": row[2],
                "server_port": row[3],
                "server_version": row[4],
            },
            "counts": {
                "app_users": users_count,
                "auth_sessions": sessions_count,
            },
            "latest_users": latest_users,
        }

    except Exception as ex:
        return JSONResponse(
            status_code=200,
            content={"ok": False, "error": str(ex)},
        )