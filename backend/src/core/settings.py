import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
CONFIG_DIR = BASE_DIR / "config"
I18N_DIR = BASE_DIR / "i18n"

def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

@dataclass(frozen=True)
class Settings:
    # ENV
    apifootball_base_url: str
    apifootball_key: str
    the_odds_api_base_url: str
    the_odds_api_key: str

    # App
    db_path: str
    database_url: Optional[str]
    default_lang: str
    supported_langs: List[str]

    # Config files
    sports_config: Dict[str, Any]
    apifootball_endpoints: Dict[str, Any]
    theodds_endpoints: Dict[str, Any]
    app_defaults: Dict[str, Any]

def load_settings() -> Settings:
    # Carrega .env do backend/ (se existir)
    load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

    # ENV (único lugar)
    apifootball_base_url = os.getenv("APIFOOTBALL_BASE_URL", "").strip()
    apifootball_key = os.getenv("APIFOOTBALL_KEY", "").strip()
    the_odds_api_base_url = os.getenv("THE_ODDS_API_BASE_URL", "").strip()
    the_odds_api_key = os.getenv("THE_ODDS_API_KEY", "").strip()

    # Defaults com fallback seguro (mínimo hardcode)
    app_defaults = _read_json(CONFIG_DIR / "app.defaults.json")
    db_path = os.getenv("PREVIA_DB_PATH", app_defaults.get("db_path", "data/app.db"))
    database_url = os.getenv("DATABASE_URL", "").strip() or None
    default_lang = app_defaults.get("default_lang", "pt-BR")
    supported_langs = app_defaults.get("supported_langs", ["pt-BR", "en", "es"])

    # Configs externas (contrato do sistema)
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
        sports_config=sports_config,
        apifootball_endpoints=apifootball_endpoints,
        theodds_endpoints=theodds_endpoints,
        app_defaults=app_defaults,
    )

