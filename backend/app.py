from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from src.core.settings import load_settings, BASE_DIR
from src.routes.debug_db import router as debug_db_router

# Admin (DB/metrics/matchup etc.)
from src.routers.admin_router import admin_router, admin_odds_router

app.include_router(admin_router)
app.include_router(admin_odds_router)

# Odds admin
from src.http.admin_odds_router import router as admin_odds_router


def create_app() -> FastAPI:
    settings = load_settings()
    api = FastAPI(title="prevIA", version="v0")

    # CORS — liberar Vite (localhost e 127.0.0.1, portas comuns)
    api.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers (TODOS aqui dentro, antes do return)
    api.include_router(admin_router)
    api.include_router(admin_odds_router)
    api.include_router(debug_db_router)

    @api.get("/", response_class=HTMLResponse)
    def index():
        index_path = BASE_DIR / "index.html"
        if index_path.exists():
            return index_path.read_text(encoding="utf-8")
        return "<h1>prevIA</h1><p>index.html não encontrado.</p>"

    @api.get("/health")
    def health():
        return {
            "ok": True,
            "db_path": settings.db_path,
            "apifootball_base_url_set": bool(settings.apifootball_base_url),
            "apifootball_key_set": bool(settings.apifootball_key),
            "the_odds_api_base_url_set": bool(settings.the_odds_api_base_url),
            "the_odds_api_key_set": bool(settings.the_odds_api_key),
        }

    return api


app = create_app()
