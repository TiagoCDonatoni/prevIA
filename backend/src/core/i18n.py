import json
from pathlib import Path
from typing import Any, Dict

from .settings import I18N_DIR, Settings

def load_lang(lang: str) -> Dict[str, Any]:
    path = I18N_DIR / f"{lang}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))

class I18N:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.cache: Dict[str, Dict[str, Any]] = {}

    def t(self, key: str, lang: str | None = None) -> str:
        lang = (lang or self.settings.default_lang)
        if lang not in self.settings.supported_langs:
            lang = self.settings.default_lang

        if lang not in self.cache:
            self.cache[lang] = load_lang(lang)

        # fallback: default_lang
        value = self.cache[lang].get(key)
        if value is not None:
            return str(value)

        if self.settings.default_lang not in self.cache:
            self.cache[self.settings.default_lang] = load_lang(self.settings.default_lang)

        return str(self.cache[self.settings.default_lang].get(key, key))
