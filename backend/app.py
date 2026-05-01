from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from src.core.settings import load_settings, BASE_DIR
from src.routes.debug_db import router as debug_db_router

from src.http.admin_router import admin_router, admin_odds_router
from src.http.odds_router import router as odds_router
from src.http.public_router import router as public_router
from src.http.admin_odds_router import router as legacy_admin_odds_router
from src.http.admin_matchup_router import router as admin_matchup_router
from src.http.admin_catalog_router import router as admin_catalog_router
from src.http.product_leagues_router import router as product_leagues_router
from src.http.product_manual_analysis_router import router as product_manual_analysis_router
from src.http.product_manual_analysis_image_router import router as product_manual_analysis_image_router
from src.http.product_index_router import router as product_index_router
from src.http.auth_router import router as auth_router
from src.http.access_router import router as access_router
from src.http.admin_ops_router import router as admin_ops_router
from src.http.internal_ops_router import router as internal_ops_router
from src.http.admin_users_router import router as admin_users_router
from src.http.billing_router import router as billing_router
from src.http.admin_access_campaigns_router import router as admin_access_campaigns_router


def create_app() -> FastAPI:
    settings = load_settings()

    if settings.app_env in {"prod", "production"} and settings.admin_dev_bypass_enabled:
        raise RuntimeError("ADMIN_DEV_BYPASS_ENABLED must be false in production.")

    if settings.app_env in {"prod", "production"} and settings.product_dev_auto_login_enabled:
        raise RuntimeError("PRODUCT_DEV_AUTO_LOGIN_ENABLED must be false in production.")

    if (
        settings.app_env in {"prod", "production"}
        and settings.ops_manual_trigger_enabled
        and not settings.ops_trigger_token
    ):
        raise RuntimeError("OPS_TRIGGER_TOKEN must be set when OPS_MANUAL_TRIGGER_ENABLED=true in production.")

    api = FastAPI(title="prevIA", version="v0")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api.include_router(admin_router)
    api.include_router(admin_odds_router)
    api.include_router(public_router)
    api.include_router(legacy_admin_odds_router)
    api.include_router(admin_matchup_router)

    api.include_router(debug_db_router)
    api.include_router(odds_router)
    api.include_router(access_router)

    api.include_router(admin_catalog_router)
    api.include_router(product_leagues_router)
    api.include_router(product_manual_analysis_router)
    api.include_router(product_manual_analysis_image_router)
    api.include_router(product_index_router)
    api.include_router(auth_router)
    api.include_router(billing_router)
    api.include_router(admin_ops_router)
    api.include_router(internal_ops_router)
    api.include_router(admin_users_router)
    api.include_router(admin_access_campaigns_router)

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
            "database_url_set": bool(settings.database_url),
            "app_env": settings.app_env,
            "frontend_allowed_origins": settings.frontend_allowed_origins,
            "product_auth_enabled": settings.product_auth_enabled,
            "admin_auth_enabled": settings.admin_auth_enabled,
            "product_dev_auto_login_enabled": settings.product_dev_auto_login_enabled,
            "admin_dev_bypass_enabled": settings.admin_dev_bypass_enabled,
            "apifootball_base_url_set": bool(settings.apifootball_base_url),
            "apifootball_key_set": bool(settings.apifootball_key),
            "the_odds_api_base_url_set": bool(settings.the_odds_api_base_url),
            "the_odds_api_key_set": bool(settings.the_odds_api_key),
            "ops_mode": settings.ops_mode,
            "ops_manual_trigger_enabled": settings.ops_manual_trigger_enabled,
            "ops_trigger_token_set": bool(settings.ops_trigger_token),
        }

    return api


app = create_app()