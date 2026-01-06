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
