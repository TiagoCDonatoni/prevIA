import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
CONFIG_DIR = BASE_DIR / "config"
I18N_DIR = BASE_DIR / "i18n"


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if raw == "":
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_str(name: str, default: str = "") -> str:
    return str(os.getenv(name, default)).strip()


def _env_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if raw == "":
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _env_csv(name: str, default: Optional[List[str]] = None) -> List[str]:
    raw = _env_str(name, "")
    if raw == "":
        return list(default or [])

    items: List[str] = []
    seen = set()

    for part in raw.split(","):
        value = part.strip().rstrip("/")
        if not value or value in seen:
            continue
        seen.add(value)
        items.append(value)

    return items


@dataclass(frozen=True)
class Settings:
    apifootball_base_url: str
    apifootball_key: str
    the_odds_api_base_url: str
    the_odds_api_key: str

    db_path: str
    database_url: Optional[str]
    default_lang: str
    supported_langs: List[str]
    app_env: str

    frontend_allowed_origins: List[str]
    product_public_origin: str

    product_auth_enabled: bool
    admin_auth_enabled: bool
    product_dev_auto_login_enabled: bool
    product_dev_auto_login_email: str
    product_dev_auto_login_plan: str
    admin_dev_bypass_enabled: bool
    admin_dev_actor_email: str
    internal_staff_admin_emails: List[str]

    product_session_cookie_name: str
    product_session_ttl_days: int
    product_session_cookie_secure: bool
    product_session_cookie_samesite: str
    product_session_cookie_domain: Optional[str]
    product_password_reset_ttl_minutes: int
    product_password_reset_debug_token_enabled: bool
    product_google_client_ids: List[str]

    stripe_sandbox_secret_key: str
    stripe_sandbox_publishable_key: str
    stripe_sandbox_webhook_secret: str
    stripe_live_secret_key: str
    stripe_live_publishable_key: str
    stripe_live_webhook_secret: str
    stripe_checkout_success_url: str
    stripe_checkout_cancel_url: str
    stripe_portal_return_url: str

    ops_mode: str
    ops_manual_trigger_enabled: bool
    ops_trigger_token: str

    sports_config: Dict[str, Any]

    apifootball_endpoints: Dict[str, Any]
    theodds_endpoints: Dict[str, Any]
    app_defaults: Dict[str, Any]


def load_settings() -> Settings:
    load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

    apifootball_base_url = _env_str("APIFOOTBALL_BASE_URL")
    apifootball_key = _env_str("APIFOOTBALL_KEY")
    the_odds_api_base_url = _env_str("THE_ODDS_API_BASE_URL")
    the_odds_api_key = _env_str("THE_ODDS_API_KEY")

    app_defaults = _read_json(CONFIG_DIR / "app.defaults.json")
    db_path = _env_str("PREVIA_DB_PATH", app_defaults.get("db_path", "data/app.db"))
    database_url = _env_str("DATABASE_URL") or None
    default_lang = app_defaults.get("default_lang", "pt-BR")
    supported_langs = app_defaults.get("supported_langs", ["pt-BR", "en", "es"])
    app_env = _env_str("APP_ENV", "dev").lower()

    default_frontend_allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    frontend_allowed_origins = _env_csv(
        "FRONTEND_ALLOWED_ORIGINS",
        default=default_frontend_allowed_origins if app_env in {"dev", "development"} else [],
    )
    product_public_origin = _env_str("PRODUCT_PUBLIC_ORIGIN", "http://localhost:5173").rstrip("/")

    product_auth_enabled = _env_bool("PRODUCT_AUTH_ENABLED", default=False)
    admin_auth_enabled = _env_bool("ADMIN_AUTH_ENABLED", default=False)

    product_dev_auto_login_enabled = _env_bool("PRODUCT_DEV_AUTO_LOGIN_ENABLED", default=False)
    product_dev_auto_login_email = _env_str("PRODUCT_DEV_AUTO_LOGIN_EMAIL", "dev@previa.local")
    product_dev_auto_login_plan = _env_str("PRODUCT_DEV_AUTO_LOGIN_PLAN", "PRO").upper()

    admin_dev_bypass_enabled = _env_bool("ADMIN_DEV_BYPASS_ENABLED", default=True)
    admin_dev_actor_email = _env_str("ADMIN_DEV_ACTOR_EMAIL", "dev-admin@previa.local")
    internal_staff_admin_emails = [
        item.strip().lower()
        for item in _env_csv("INTERNAL_STAFF_ADMIN_EMAILS", default=[])
        if item.strip()
    ]

    default_cookie_secure = app_env in {"prod", "production"}
    product_session_cookie_name = _env_str("PRODUCT_SESSION_COOKIE_NAME", "__session")
    product_session_ttl_days = max(1, _env_int("PRODUCT_SESSION_TTL_DAYS", 30))
    product_session_cookie_secure = _env_bool(
        "PRODUCT_SESSION_COOKIE_SECURE",
        default=default_cookie_secure,
    )
    product_session_cookie_samesite = _env_str("PRODUCT_SESSION_COOKIE_SAMESITE", "lax").lower()
    if product_session_cookie_samesite not in {"lax", "strict", "none"}:
        product_session_cookie_samesite = "lax"

    product_session_cookie_domain = _env_str("PRODUCT_SESSION_COOKIE_DOMAIN", "") or None

    product_password_reset_ttl_minutes = max(5, _env_int("PRODUCT_PASSWORD_RESET_TTL_MINUTES", 60))
    product_password_reset_debug_token_enabled = _env_bool(
        "PRODUCT_PASSWORD_RESET_DEBUG_TOKEN_ENABLED",
        default=app_env in {"dev", "development"},
    )
    product_google_client_ids = [
        item.strip()
        for item in _env_str("PRODUCT_GOOGLE_CLIENT_IDS", "").split(",")
        if item.strip()
    ]

    stripe_sandbox_secret_key = _env_str("STRIPE_SANDBOX_SECRET_KEY") or _env_str("STRIPE_SECRET_KEY")
    stripe_sandbox_publishable_key = _env_str("STRIPE_SANDBOX_PUBLISHABLE_KEY") or _env_str("STRIPE_PUBLISHABLE_KEY")
    stripe_sandbox_webhook_secret = _env_str("STRIPE_SANDBOX_WEBHOOK_SECRET") or _env_str("STRIPE_WEBHOOK_SECRET")
    stripe_live_secret_key = _env_str("STRIPE_LIVE_SECRET_KEY")
    stripe_live_publishable_key = _env_str("STRIPE_LIVE_PUBLISHABLE_KEY")
    stripe_live_webhook_secret = _env_str("STRIPE_LIVE_WEBHOOK_SECRET")
    stripe_checkout_success_url = _env_str("STRIPE_CHECKOUT_SUCCESS_URL")
    stripe_checkout_cancel_url = _env_str("STRIPE_CHECKOUT_CANCEL_URL")
    stripe_portal_return_url = _env_str("STRIPE_PORTAL_RETURN_URL")

    ops_mode = _env_str("OPS_MODE", "manual").lower()
    if ops_mode not in {"manual", "economic", "v1"}:
        ops_mode = "manual"

    ops_manual_trigger_enabled = _env_bool("OPS_MANUAL_TRIGGER_ENABLED", default=False)
    ops_trigger_token = _env_str("OPS_TRIGGER_TOKEN")

    sports_config = _read_json(CONFIG_DIR / "sports.json")
    apifootball_endpoints = _read_json(CONFIG_DIR / "endpoints.apifootball.json")
    theodds_endpoints = _read_json(CONFIG_DIR / "endpoints.theodds.json")

    return Settings(
        apifootball_base_url=apifootball_base_url,
        apifootball_key=apifootball_key,
        the_odds_api_base_url=the_odds_api_base_url,
        the_odds_api_key=the_odds_api_key,
        db_path=db_path,
        database_url=database_url,
        default_lang=default_lang,
        supported_langs=supported_langs,
        app_env=app_env,
        frontend_allowed_origins=frontend_allowed_origins,
        product_public_origin=product_public_origin,
        product_auth_enabled=product_auth_enabled,
        admin_auth_enabled=admin_auth_enabled,
        product_dev_auto_login_enabled=product_dev_auto_login_enabled,
        product_dev_auto_login_email=product_dev_auto_login_email,
        product_dev_auto_login_plan=product_dev_auto_login_plan,
        admin_dev_bypass_enabled=admin_dev_bypass_enabled,
        admin_dev_actor_email=admin_dev_actor_email,
        internal_staff_admin_emails=internal_staff_admin_emails,
        product_session_cookie_name=product_session_cookie_name,
        product_session_ttl_days=product_session_ttl_days,
        product_session_cookie_secure=product_session_cookie_secure,
        product_session_cookie_samesite=product_session_cookie_samesite,
        product_session_cookie_domain=product_session_cookie_domain,
        product_password_reset_ttl_minutes=product_password_reset_ttl_minutes,
        product_password_reset_debug_token_enabled=product_password_reset_debug_token_enabled,
        product_google_client_ids=product_google_client_ids,
        stripe_sandbox_secret_key=stripe_sandbox_secret_key,
        stripe_sandbox_publishable_key=stripe_sandbox_publishable_key,
        stripe_sandbox_webhook_secret=stripe_sandbox_webhook_secret,
        stripe_live_secret_key=stripe_live_secret_key,
        stripe_live_publishable_key=stripe_live_publishable_key,
        stripe_live_webhook_secret=stripe_live_webhook_secret,
        stripe_checkout_success_url=stripe_checkout_success_url,
        stripe_checkout_cancel_url=stripe_checkout_cancel_url,
        stripe_portal_return_url=stripe_portal_return_url,
        ops_mode=ops_mode,
        ops_manual_trigger_enabled=ops_manual_trigger_enabled,
        ops_trigger_token=ops_trigger_token,
        sports_config=sports_config,
        apifootball_endpoints=apifootball_endpoints,
        theodds_endpoints=theodds_endpoints,
        app_defaults=app_defaults,
    )