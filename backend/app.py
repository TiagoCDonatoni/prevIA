from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from src.core.settings import load_settings, BASE_DIR
from src.api.routes_admin import router as admin_router

from src.routes.debug_db import router as debug_db_router

def create_app() -> FastAPI:
    settings = load_settings()
    api = FastAPI(title="prevIA", version="v0")

    api.include_router(admin_router)

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
        }

    return api


app = create_app()

app.include_router(debug_db_router)
