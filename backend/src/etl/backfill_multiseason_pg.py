# backend/src/etl/backfill_multiseason_pg.py
from __future__ import annotations

from psycopg.types.json import Json

import argparse
import json
from typing import Any, Dict, List, Optional

from tqdm import tqdm  # <-- Opção B: barra de progresso

from src.core.settings import load_settings, CONFIG_DIR
from src.db.pg import pg_conn, pg_tx
from src.provider.apifootball.client import ApiFootballClient

from src.etl.raw_ingest_pg import insert_raw_response
from src.etl.core_etl_pg import (
    LEAGUES_UPSERT_SQL,
    TEAMS_UPSERT_SQL,
    FIXTURES_UPSERT_SQL,
    map_league,
    map_team,
    map_fixture,
    _iter_response_items,  # ok usar internamente aqui, pois é seu próprio módulo
)


def _read_json(path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _fmt_params(template: Dict[str, Any], league_id: int, season: int) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in (template or {}).items():
        if isinstance(v, str):
            v = v.replace("{league_id}", str(league_id)).replace("{season}", str(season))
        out[k] = v
    return out


def _get_checkpoint(provider: str, endpoint: str, league_id: int, season: int) -> Dict[str, Any]:
    sql = """
    select last_page_done, total_pages, status, meta
    from raw.backfill_checkpoint
    where provider=%(p)s and endpoint=%(e)s and league_id=%(l)s and season=%(s)s
    """
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"p": provider, "e": endpoint, "l": league_id, "s": season})
            row = cur.fetchone()
            if not row:
                return {"last_page_done": 0, "total_pages": None, "status": "new", "meta": {}}
            return {"last_page_done": row[0], "total_pages": row[1], "status": row[2], "meta": row[3] or {}}


def _upsert_checkpoint(
    provider: str,
    endpoint: str,
    league_id: int,
    season: int,
    last_page_done: int,
    total_pages: Optional[int],
    status: str,
    meta: Dict[str, Any],
) -> None:
    sql = """
    insert into raw.backfill_checkpoint (
      provider, endpoint, league_id, season,
      last_page_done, total_pages, status, meta, updated_at_utc
    )
    values (
      %(p)s, %(e)s, %(l)s, %(s)s,
      %(lp)s, %(tp)s, %(st)s, %(m)s, now()
    )
    on conflict (provider, endpoint, league_id, season) do update set
      last_page_done = excluded.last_page_done,
      total_pages = excluded.total_pages,
      status = excluded.status,
      meta = excluded.meta,
      updated_at_utc = now();
    """
    with pg_conn() as conn:
        with pg_tx(conn):
            with conn.cursor() as cur:
                cur.execute(
                    sql,
                    {
                        "p": provider,
                        "e": endpoint,
                        "l": league_id,
                        "s": season,
                        "lp": last_page_done,
                        "tp": total_pages,
                        "st": status,
                        "m": Json(meta),
                    },
                )


def _apply_core_from_payload(endpoint: str, payload: Dict[str, Any]) -> int:
    """
    Aplica no CORE imediatamente para você ver o banco enchendo,
    sem depender de "limit" varrendo RAW.
    """
    items = list(_iter_response_items(payload))

    if endpoint == "leagues":
        mapped = [map_league(it) for it in items]
        mapped = [m for m in mapped if m is not None]
        sql = LEAGUES_UPSERT_SQL
    elif endpoint == "teams":
        mapped = [map_team(it) for it in items]
        mapped = [m for m in mapped if m is not None]
        sql = TEAMS_UPSERT_SQL
    elif endpoint == "fixtures":
        mapped = [map_fixture(it) for it in items]
        mapped = [m for m in mapped if m is not None]
        sql = FIXTURES_UPSERT_SQL
    else:
        return 0

    if not mapped:
        return 0

    with pg_conn() as conn:
        with pg_tx(conn):
            with conn.cursor() as cur:
                n = 0
                for row in mapped:
                    cur.execute(sql, row)
                    n += 1
                return n


def _resolve_league_ids(plan: Dict[str, Any]) -> List[int]:
    src = (plan.get("league_source") or {})
    mode = src.get("mode", "ids")
    max_leagues = int(src.get("max_leagues", 50))

    if mode == "ids":
        ids = src.get("league_ids") or []
        ids = [int(x) for x in ids if isinstance(x, (int, str)) and str(x).strip().isdigit()]
        return ids[:max_leagues]

    if mode == "from_core":
        sql = "select league_id from core.leagues order by league_id asc limit %(n)s"
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, {"n": max_leagues})
                return [int(r[0]) for r in cur.fetchall()]

    raise ValueError("league_source.mode must be 'ids' or 'from_core'")


def _resolve_seasons(plan: Dict[str, Any]) -> List[int]:
    s = plan.get("seasons") or {}
    mode = s.get("mode", "range")
    if mode == "range":
        start = int(s.get("start"))
        end = int(s.get("end"))
        if end < start:
            raise ValueError("seasons.end must be >= seasons.start")
        return list(range(start, end + 1))

    if mode == "list":
        seasons = s.get("items") or []
        return [int(x) for x in seasons]

    raise ValueError("seasons.mode must be 'range' or 'list'")


def run_backfill(*, dry_run: bool, resume: bool, stop_after: Optional[int]) -> Dict[str, Any]:
    settings = load_settings()
    plan = _read_json(CONFIG_DIR / "backfill.apifootball.json")
    provider = plan.get("provider", "apifootball")

    client = ApiFootballClient(
        base_url=settings.apifootball_base_url,
        api_key=settings.apifootball_key,
        timeout_s=int(settings.app_defaults.get("http_timeout_s", 30)),
    )

    league_ids = _resolve_league_ids(plan)
    seasons = _resolve_seasons(plan)
    endpoints = plan.get("endpoints") or []
    paging = plan.get("paging") or {}
    page_param = paging.get("page_param")  # None => sem paginação por parâmetro
    max_pages_safety = int(paging.get("max_pages_safety", 50))

    counters = {
        "raw_inserted": 0,
        "raw_dedup": 0,
        "core_upserts": 0,
        "calls_ok": 0,
        "calls_fail": 0,
        "pages_ok": 0,
        "pages_fail": 0,
    }

    # Monta todas as unidades antes para ter barra de progresso global (Units)
    plan_units: List[Dict[str, Any]] = []
    for league_id in league_ids:
        for season in seasons:
            for ep in endpoints:
                plan_units.append(
                    {
                        "league_id": int(league_id),
                        "season": int(season),
                        "ep_id": str(ep["id"]),
                        "path": str(ep["path"]),
                        "params_template": ep.get("params") or {},
                    }
                )

    total_units = len(plan_units)

    units_bar = tqdm(plan_units, desc="Units", unit="unit", dynamic_ncols=True, total=total_units)

    for unit in units_bar:
        league_id = int(unit["league_id"])
        season = int(unit["season"])
        ep_id = str(unit["ep_id"])
        path = str(unit["path"])
        params_template = unit["params_template"]

        base_params = _fmt_params(params_template, league_id=league_id, season=season)

        # checkpoint
        ck = _get_checkpoint(provider, ep_id, league_id, season)
        if resume and ck.get("status") == "done":
            continue

        start_page = int(ck.get("last_page_done") or 0) + 1 if resume else 1
        seen_total_pages: Optional[int] = ck.get("total_pages")

        # Atualiza descrição da unit atual
        units_bar.set_postfix_str(f"{ep_id} L{league_id} S{season} p{start_page}")

        page = start_page

        # Barra de páginas (Pages) com total dinâmico (só fica conhecido após a 1ª resposta)
        pages_bar = tqdm(
            desc=f"Pages {ep_id} L{league_id} S{season}",
            unit="page",
            dynamic_ncols=True,
            leave=False,
            total=seen_total_pages if isinstance(seen_total_pages, int) else None,
            initial=page - 1,
        )

        try:
            while True:
                if page > max_pages_safety:
                    _upsert_checkpoint(
                        provider,
                        ep_id,
                        league_id,
                        season,
                        last_page_done=page - 1,
                        total_pages=seen_total_pages,
                        status="failed",
                        meta={"reason": "max_pages_safety_exceeded"},
                    )
                    counters["pages_fail"] += 1
                    break

                params = dict(base_params)
                if page_param:
                    params[str(page_param)] = page

                if dry_run:
                    status, payload = 200, {"response": [], "paging": {"current": page, "total": page}}
                else:
                    try:
                        status, payload = client.get(path, params)
                    except Exception as ex:
                        status, payload = 599, {"errors": {"exception": str(ex)}, "response": None}

                ok_http = 200 <= int(status) < 300
                api_errors = payload.get("errors") if isinstance(payload, dict) else None

                # api-football costuma retornar [] quando ok; quando dá problema vem dict com campos
                has_api_errors = isinstance(api_errors, dict) and len(api_errors) > 0

                ok = bool(ok_http and not has_api_errors)

                ok = bool(ok_http and not has_api_errors)

                if not isinstance(payload, dict):
                    payload = {"errors": {"non_dict_payload": True}, "response": None}

                # RAW ingest (idempotente)
                inserted, _ = insert_raw_response(
                    provider=provider,
                    endpoint=str(ep_id),
                    request_params={"path": path, "params": params, "league_id": league_id, "season": season},
                    response_body=payload,
                    http_status=int(status),
                    ok=ok,
                    error_message=None if ok else str(payload.get("errors")),
                )
                if inserted:
                    counters["raw_inserted"] += 1
                else:
                    counters["raw_dedup"] += 1

                if not ok:
                    counters["calls_fail"] += 1
                    counters["pages_fail"] += 1
                    _upsert_checkpoint(
                        provider,
                        ep_id,
                        league_id,
                        season,
                        last_page_done=page - 1,
                        total_pages=seen_total_pages,
                        status="failed",
                        meta={"http_status": int(status), "errors": payload.get("errors")},
                    )
                    # Mostra erro na barra
                    pages_bar.set_postfix_str(f"FAIL {status}")
                    break

                counters["calls_ok"] += 1
                counters["pages_ok"] += 1

                # CORE apply imediato
                counters["core_upserts"] += _apply_core_from_payload(str(ep_id), payload)

                paging_info = payload.get("paging") or {}
                tot = paging_info.get("total")

                if isinstance(tot, int):
                    seen_total_pages = tot
                    # Atualiza total do tqdm quando descoberto
                    if pages_bar.total is None:
                        pages_bar.total = tot

                # checkpoint a cada página ok
                _upsert_checkpoint(
                    provider,
                    ep_id,
                    league_id,
                    season,
                    last_page_done=page,
                    total_pages=seen_total_pages,
                    status="running",
                    meta={"last_ok_status": int(status)},
                )

                # Atualiza a barra
                pages_bar.set_postfix_str(
                    f"ok={counters['calls_ok']} raw={counters['raw_inserted']} dedup={counters['raw_dedup']}"
                )
                pages_bar.update(1)

                # se não tem paginação, assume 1 página e encerra
                if not isinstance(tot, int):
                    _upsert_checkpoint(
                        provider,
                        ep_id,
                        league_id,
                        season,
                        last_page_done=page,
                        total_pages=1,
                        status="done",
                        meta={"note": "no_paging_in_payload"},
                    )
                    break

                # terminou?
                if page >= tot:
                    _upsert_checkpoint(
                        provider,
                        ep_id,
                        league_id,
                        season,
                        last_page_done=page,
                        total_pages=tot,
                        status="done",
                        meta={"note": "completed"},
                    )
                    break

                page += 1

        finally:
            pages_bar.close()

        if stop_after is not None:
            stop_after -= 1
            if stop_after <= 0:
                return {"provider": provider, "stopped_early": True, "counters": counters, "units": total_units}

    return {"provider": provider, "stopped_early": False, "counters": counters, "units": total_units}


def main() -> None:
    ap = argparse.ArgumentParser(description="Multi-season backfill (API-Football -> RAW -> CORE) with checkpoint")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--resume", action="store_true", help="resume using raw.backfill_checkpoint")
    ap.add_argument("--stop-after", type=int, default=None, help="stop after N endpoint units (debug)")
    args = ap.parse_args()

    result = run_backfill(dry_run=bool(args.dry_run), resume=bool(args.resume), stop_after=args.stop_after)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
