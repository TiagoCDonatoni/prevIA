from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Dict, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from src.core.settings import load_settings
from src.db.pg import pg_conn
from src.integrations.product_email import send_product_email

router = APIRouter(prefix="/public/worldcup-pool", tags=["worldcup-pool"])


Lang = Literal["pt", "en", "es"]
WorldCupPoolScoringMode = Literal["classic", "weighted_by_stage"]
WorldCupPoolMatchFilter = Literal["all", "pending", "predicted", "locked"]
WorldCupPoolMatchRoundFilter = Literal["all", "1", "2", "3"]

PIN_HASH_ITERATIONS = 180_000
PIN_MAX_FAILED_ATTEMPTS = 5
PIN_LOCK_WINDOW_MINUTES = 15

POOL_CREATE_EMAIL_WINDOW_MINUTES = 60
POOL_CREATE_EMAIL_MAX_ATTEMPTS = 3

POOL_CREATE_GLOBAL_WINDOW_MINUTES = 10
POOL_CREATE_GLOBAL_MAX_ATTEMPTS = 50

WORLDCUP_POOL_COOKIE_PATH = "/public/worldcup-pool"
WORLDCUP_POOL_ORGANIZER_COOKIE_PATH = WORLDCUP_POOL_COOKIE_PATH
WORLDCUP_POOL_PARTICIPANT_COOKIE_PATH = WORLDCUP_POOL_COOKIE_PATH
WORLDCUP_POOL_SESSION_COOKIE_MAX_TOKENS = 24


class WorldCupPoolScoringConfig(BaseModel):
    exact_score_points: int
    outcome_points: int
    exact_team_score_bonus: int
    max_points_per_match: int


class WorldCupPoolScoringPhaseConfig(BaseModel):
    phase_key: str
    phase_label: Dict[Lang, str]
    exact_score_points: int
    outcome_points: int
    exact_team_score_bonus: int
    max_points_per_match: int


class WorldCupPoolScoringModeConfig(BaseModel):
    mode: WorldCupPoolScoringMode
    title: Dict[Lang, str]
    summary: Dict[Lang, str]
    phases: list[WorldCupPoolScoringPhaseConfig]


class WorldCupPoolStatusCopy(BaseModel):
    title: str
    subtitle: str
    cta_label: str
    scoring_summary: str


class WorldCupPoolStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    enabled: bool
    public_create_enabled: bool
    join_enabled: bool
    predictions_enabled: bool
    readonly_enabled: bool
    supported_langs: list[Lang]
    scoring: WorldCupPoolScoringConfig
    scoring_mode_default: WorldCupPoolScoringMode
    scoring_modes: list[WorldCupPoolScoringModeConfig]
    localized_copy: Dict[Lang, WorldCupPoolStatusCopy] = Field(alias="copy")


class WorldCupPoolCreateRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=120)
    organizer_name: str = Field(..., min_length=2, max_length=120)
    organizer_email: EmailStr
    organizer_pin: str = Field(..., min_length=4, max_length=4)
    lang: Lang = "pt"
    scoring_mode: WorldCupPoolScoringMode = "classic"
    marketing_opt_in: bool = False
    terms_accepted: bool = False


class WorldCupPoolCreatedPool(BaseModel):
    id: int
    slug: str
    name: str
    lang: Lang
    scoring_mode: WorldCupPoolScoringMode
    invite_token: str
    invite_url: str
    admin_url: str


class WorldCupPoolCreatedParticipant(BaseModel):
    id: int
    display_name: str
    email: str
    status: str


class WorldCupPoolCreateResponse(BaseModel):
    ok: bool = True
    pool: WorldCupPoolCreatedPool
    creator_participant: WorldCupPoolCreatedParticipant
    organizer_session_created: bool
    participant_session_created: bool


class WorldCupPoolInvitePool(BaseModel):
    id: int
    slug: str
    name: str
    lang: Lang
    scoring_mode: WorldCupPoolScoringMode
    status: str
    participant_count: int


class WorldCupPoolInviteResponse(BaseModel):
    ok: bool = True
    join_enabled: bool
    pool: WorldCupPoolInvitePool


class WorldCupPoolJoinRequest(BaseModel):
    display_name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    pin: str = Field(..., min_length=4, max_length=4)
    marketing_opt_in: bool = False
    terms_accepted: bool = False


class WorldCupPoolParticipantLoginRequest(BaseModel):
    email: EmailStr
    pin: str = Field(..., min_length=4, max_length=4)


class WorldCupPoolOrganizerLoginRequest(BaseModel):
    email: EmailStr
    pin: str = Field(..., min_length=4, max_length=4)


class WorldCupPoolAccessLoginRequest(BaseModel):
    email: EmailStr
    pin: str = Field(..., min_length=4, max_length=4)
    invite_token: Optional[str] = Field(default=None, max_length=120)


class WorldCupPoolPinResetRequest(BaseModel):
    email: EmailStr
    pool_slug: Optional[str] = Field(default=None, max_length=120)
    invite_token: Optional[str] = Field(default=None, max_length=120)


class WorldCupPoolPinResetResponse(BaseModel):
    ok: bool = True

class WorldCupPoolJoinedParticipant(BaseModel):
    id: int
    display_name: str
    email: str
    status: str
    joined_existing: bool


class WorldCupPoolJoinResponse(BaseModel):
    ok: bool = True
    pool: WorldCupPoolInvitePool
    participant: WorldCupPoolJoinedParticipant
    participant_session_created: bool

class WorldCupPoolDashboardParticipant(BaseModel):
    id: int
    display_name: str
    email: str
    status: str
    joined_at_utc: Optional[str] = None
    last_seen_at_utc: Optional[str] = None


class WorldCupPoolParticipantDashboardResponse(BaseModel):
    ok: bool = True
    pool: WorldCupPoolInvitePool
    participant: WorldCupPoolDashboardParticipant
    scoring: WorldCupPoolScoringConfig
    scoring_mode: WorldCupPoolScoringMode
    scoring_rules: WorldCupPoolScoringModeConfig


class WorldCupPoolPagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class WorldCupPoolPredictionSummary(BaseModel):
    total_matches: int
    predicted_matches: int
    pending_matches: int
    locked_matches: int


class WorldCupPoolMatchPrediction(BaseModel):
    match_id: int
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    updated_at_utc: Optional[str] = None
    locked_at_utc: Optional[str] = None


class WorldCupPoolParticipantMatch(BaseModel):
    id: int
    match_key: str
    official_match_no: Optional[int] = None
    display_order: int
    phase: str
    group_code: Optional[str] = None
    bracket_label: Optional[str] = None
    home_label: str
    away_label: str
    kickoff_utc: Optional[str] = None
    lock_at_utc: Optional[str] = None
    status: str
    is_locked: bool
    prediction: Optional[WorldCupPoolMatchPrediction] = None


class WorldCupPoolParticipantMatchesResponse(BaseModel):
    ok: bool = True
    pool: WorldCupPoolInvitePool
    participant: WorldCupPoolDashboardParticipant
    items: list[WorldCupPoolParticipantMatch]
    summary: WorldCupPoolPredictionSummary
    pagination: WorldCupPoolPagination


class WorldCupPoolPredictionUpsertRequest(BaseModel):
    home_score: int = Field(..., ge=0, le=99)
    away_score: int = Field(..., ge=0, le=99)


class WorldCupPoolSavedPrediction(BaseModel):
    id: int
    match_id: int
    home_score: int
    away_score: int
    points: int
    updated_at_utc: Optional[str] = None
    locked_at_utc: Optional[str] = None


class WorldCupPoolPredictionUpsertResponse(BaseModel):
    ok: bool = True
    prediction: WorldCupPoolSavedPrediction

class WorldCupPoolRankingItem(BaseModel):
    rank: int
    participant_id: int
    display_name: str
    points: int
    predictions_count: int
    last_prediction_at_utc: Optional[str] = None
    is_me: bool = False


class WorldCupPoolRankingResponse(BaseModel):
    ok: bool = True
    pool: WorldCupPoolInvitePool
    participant: WorldCupPoolDashboardParticipant
    me: WorldCupPoolRankingItem
    items: list[WorldCupPoolRankingItem]
    pagination: WorldCupPoolPagination

class WorldCupPoolOrganizerPool(BaseModel):
    id: int
    slug: str
    name: str
    lang: Lang
    scoring_mode: WorldCupPoolScoringMode
    status: str
    invite_token: str
    invite_url: str
    admin_url: str
    participant_count: int

class WorldCupPoolOrganizerLoginResponse(BaseModel):
    ok: bool = True
    pool: WorldCupPoolOrganizerPool
    organizer_session_created: bool

class WorldCupPoolOrganizerSessionStatusResponse(BaseModel):
    ok: bool = True
    authenticated: bool
    pool: Optional[WorldCupPoolOrganizerPool] = None

class WorldCupPoolOrganizerParticipantSessionResponse(BaseModel):
    ok: bool = True
    participant_url: str
    invite_url: str
    participant: WorldCupPoolDashboardParticipant
    participant_session_created: bool

class WorldCupPoolOrganizerSummary(BaseModel):
    active_participants: int
    filtered_participants: int
    available_matches: int


class WorldCupPoolOrganizerParticipant(BaseModel):
    id: int
    rank: int
    display_name: str
    email: str
    status: str
    points: int
    predictions_count: int
    available_matches: int
    joined_at_utc: Optional[str] = None
    last_seen_at_utc: Optional[str] = None
    last_prediction_at_utc: Optional[str] = None
    removed_at_utc: Optional[str] = None
    is_organizer: bool = False


class WorldCupPoolOrganizerDashboardResponse(BaseModel):
    ok: bool = True
    pool: WorldCupPoolOrganizerPool
    summary: WorldCupPoolOrganizerSummary
    participants: list[WorldCupPoolOrganizerParticipant]
    pagination: WorldCupPoolPagination


class WorldCupPoolRemoveParticipantRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class WorldCupPoolRemoveParticipantResponse(BaseModel):
    ok: bool = True
    participant_id: int
    status: str

class WorldCupPoolLogoutResponse(BaseModel):
    ok: bool = True

WorldCupPoolAccessRole = Literal["organizer", "participant"]


class WorldCupPoolMyPool(BaseModel):
    id: int
    slug: str
    name: str
    lang: Lang
    scoring_mode: WorldCupPoolScoringMode
    status: str
    invite_token: str
    invite_url: str
    admin_url: str
    participant_url: str
    participant_count: int
    roles: list[WorldCupPoolAccessRole]
    primary_role: WorldCupPoolAccessRole
    participant_id: Optional[int] = None
    participant_display_name: Optional[str] = None
    predictions_count: int = 0
    available_matches: int = 0


class WorldCupPoolMyPoolsResponse(BaseModel):
    ok: bool = True
    pools: list[WorldCupPoolMyPool]

CLASSIC_SCORING = WorldCupPoolScoringConfig(
    exact_score_points=5,
    outcome_points=3,
    exact_team_score_bonus=1,
    max_points_per_match=5,
)

ROUND_OF_32_SCORING = WorldCupPoolScoringConfig(
    exact_score_points=6,
    outcome_points=4,
    exact_team_score_bonus=1,
    max_points_per_match=6,
)

ROUND_OF_16_SCORING = WorldCupPoolScoringConfig(
    exact_score_points=8,
    outcome_points=5,
    exact_team_score_bonus=2,
    max_points_per_match=8,
)

QUARTER_FINAL_SCORING = WorldCupPoolScoringConfig(
    exact_score_points=10,
    outcome_points=6,
    exact_team_score_bonus=2,
    max_points_per_match=10,
)

SEMI_FINAL_SCORING = WorldCupPoolScoringConfig(
    exact_score_points=13,
    outcome_points=8,
    exact_team_score_bonus=3,
    max_points_per_match=13,
)

FINAL_SCORING = WorldCupPoolScoringConfig(
    exact_score_points=15,
    outcome_points=9,
    exact_team_score_bonus=3,
    max_points_per_match=15,
)

SCORING = CLASSIC_SCORING
WORLDCUP_POOL_DEFAULT_SCORING_MODE: WorldCupPoolScoringMode = "classic"

WEIGHTED_SCORING_BY_PHASE: Dict[str, WorldCupPoolScoringConfig] = {
    "group": CLASSIC_SCORING,
    "round_of_32": ROUND_OF_32_SCORING,
    "round_of_16": ROUND_OF_16_SCORING,
    "quarter_final": QUARTER_FINAL_SCORING,
    "semi_final": SEMI_FINAL_SCORING,
    "third_place": SEMI_FINAL_SCORING,
    "final": FINAL_SCORING,
}

SCORING_PHASE_LABELS: Dict[str, Dict[Lang, str]] = {
    "all": {"pt": "Todos os jogos", "en": "All matches", "es": "Todos los partidos"},
    "group": {"pt": "Fase de grupos", "en": "Group stage", "es": "Fase de grupos"},
    "round_of_32": {"pt": "Fase extra", "en": "Extra knockout round", "es": "Ronda extra"},
    "round_of_16": {"pt": "Oitavas", "en": "Round of 16", "es": "Octavos"},
    "quarter_final": {"pt": "Quartas", "en": "Quarter-finals", "es": "Cuartos"},
    "semi_final": {"pt": "Semifinais", "en": "Semi-finals", "es": "Semifinales"},
    "third_place": {"pt": "Disputa de 3º lugar", "en": "Third-place match", "es": "Tercer puesto"},
    "final": {"pt": "Final", "en": "Final", "es": "Final"},
}

SCORING_MODE_TITLES: Dict[WorldCupPoolScoringMode, Dict[Lang, str]] = {
    "classic": {
        "pt": "Clássica",
        "en": "Classic",
        "es": "Clásica",
    },
    "weighted_by_stage": {
        "pt": "Emoção até a final",
        "en": "Drama until the final",
        "es": "Emoción hasta la final",
    },
}

SCORING_MODE_SUMMARIES: Dict[WorldCupPoolScoringMode, Dict[Lang, str]] = {
    "classic": {
        "pt": "Todos os jogos valem a mesma pontuação: simples, familiar e fácil de explicar.",
        "en": "Every match uses the same scoring table: simple, familiar, and easy to explain.",
        "es": "Todos los partidos usan la misma puntuación: simple, familiar y fácil de explicar.",
    },
    "weighted_by_stage": {
        "pt": "Os jogos do mata-mata valem mais pontos para manter a disputa viva até a final.",
        "en": "Knockout matches are worth more points to keep the race alive until the final.",
        "es": "Los partidos eliminatorios valen más puntos para mantener la disputa viva hasta la final.",
    },
}


COPY: Dict[Lang, WorldCupPoolStatusCopy] = {
    "pt": WorldCupPoolStatusCopy(
        title="Crie seu Bolão da Copa 2026 grátis",
        subtitle="Monte seu bolão online, compartilhe o link no grupo e acompanhe os palpites da Copa em um ranking simples, leve e feito para celular.",
        cta_label="Criar bolão grátis",
        scoring_summary="O organizador escolhe entre pontuação Clássica ou Emoção até a final. Na Clássica, placar exato vale 5 pontos, resultado correto vale 3 e gol exato de um time pode render ponto parcial.",
    ),
    "en": WorldCupPoolStatusCopy(
        title="Create your free World Cup 2026 Pool",
        subtitle="Launch an online pool, share the invite link with your group, and follow World Cup predictions through a simple mobile-first leaderboard.",
        cta_label="Create free pool",
        scoring_summary="The organizer chooses between Classic scoring or Drama until the final. In Classic mode, exact score is worth 5 points, correct outcome is worth 3, and an exact team score can earn a partial point.",
    ),
    "es": WorldCupPoolStatusCopy(
        title="Crea tu Porra del Mundial 2026 gratis",
        subtitle="Lanza una porra online, comparte el enlace con tu grupo y sigue los pronósticos del Mundial en un ranking simple y pensado para móvil.",
        cta_label="Crear porra gratis",
        scoring_summary="El organizador elige entre puntuación Clásica o Emoción hasta la final. En la Clásica, el marcador exacto vale 5 puntos, el resultado correcto vale 3 y acertar los goles de un equipo puede sumar un punto parcial.",
    ),
}

def _normalize_worldcup_scoring_mode(value: str | None) -> WorldCupPoolScoringMode:
    return "weighted_by_stage" if value == "weighted_by_stage" else "classic"


def _worldcup_scoring_config_for_phase(
    mode: WorldCupPoolScoringMode,
    phase: str | None,
) -> WorldCupPoolScoringConfig:
    scoring_mode = _normalize_worldcup_scoring_mode(mode)

    if scoring_mode == "weighted_by_stage":
        return WEIGHTED_SCORING_BY_PHASE.get(str(phase or ""), CLASSIC_SCORING)

    return CLASSIC_SCORING


def _worldcup_scoring_phase_config(
    phase_key: str,
    config: WorldCupPoolScoringConfig,
) -> WorldCupPoolScoringPhaseConfig:
    return WorldCupPoolScoringPhaseConfig(
        phase_key=phase_key,
        phase_label=SCORING_PHASE_LABELS.get(phase_key, SCORING_PHASE_LABELS["all"]),
        exact_score_points=config.exact_score_points,
        outcome_points=config.outcome_points,
        exact_team_score_bonus=config.exact_team_score_bonus,
        max_points_per_match=config.max_points_per_match,
    )


def _worldcup_scoring_rules(mode: WorldCupPoolScoringMode) -> WorldCupPoolScoringModeConfig:
    scoring_mode = _normalize_worldcup_scoring_mode(mode)

    if scoring_mode == "weighted_by_stage":
        phase_order = [
            "group",
            "round_of_32",
            "round_of_16",
            "quarter_final",
            "semi_final",
            "third_place",
            "final",
        ]
        phases = [
            _worldcup_scoring_phase_config(phase_key, WEIGHTED_SCORING_BY_PHASE[phase_key])
            for phase_key in phase_order
        ]
    else:
        phases = [_worldcup_scoring_phase_config("all", CLASSIC_SCORING)]

    return WorldCupPoolScoringModeConfig(
        mode=scoring_mode,
        title=SCORING_MODE_TITLES[scoring_mode],
        summary=SCORING_MODE_SUMMARIES[scoring_mode],
        phases=phases,
    )


def _worldcup_available_scoring_modes() -> list[WorldCupPoolScoringModeConfig]:
    return [
        _worldcup_scoring_rules("classic"),
        _worldcup_scoring_rules("weighted_by_stage"),
    ]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_slug(value: str) -> str:
    raw = unicodedata.normalize("NFKD", value.strip())
    raw = raw.encode("ascii", "ignore").decode("ascii")
    raw = raw.lower()
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    raw = re.sub(r"-+", "-", raw).strip("-")
    return raw[:70].strip("-") or "bolao-copa"


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        PIN_HASH_ITERATIONS,
    )
    return f"pbkdf2_sha256${PIN_HASH_ITERATIONS}${_b64(salt)}${_b64(digest)}"

def _decode_b64(value: str) -> bytes:
    padded = value + ("=" * (-len(value) % 4))
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _verify_pin(pin: str, stored_hash: str) -> bool:
    try:
        algo, iterations_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False

        iterations = int(iterations_raw)
        salt = _decode_b64(salt_raw)
        expected_digest = _decode_b64(digest_raw)

        actual_digest = hashlib.pbkdf2_hmac(
            "sha256",
            pin.encode("utf-8"),
            salt,
            iterations,
        )

        return secrets.compare_digest(actual_digest, expected_digest)
    except Exception:
        return False

def _hash_session_token(token: str) -> str:
    return "sha256$" + hashlib.sha256(token.encode("utf-8")).hexdigest()


def _validate_pin(pin: str) -> None:
    if not re.fullmatch(r"\d{4}", pin or ""):
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "INVALID_PIN",
                "message": "PIN must contain exactly 4 numeric digits.",
            },
        )


def _hash_login_identifier(value: str) -> str:
    normalized = str(value or "").strip().lower()
    return "sha256$" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _client_ip_hash(request: Request) -> Optional[str]:
    forwarded_for = str(request.headers.get("x-forwarded-for") or "").strip()
    if forwarded_for:
        raw_ip = forwarded_for.split(",", 1)[0].strip()
    else:
        raw_ip = str(request.headers.get("x-real-ip") or "").strip()

    if not raw_ip and request.client:
        raw_ip = str(request.client.host or "").strip()

    if not raw_ip:
        return None

    return _hash_login_identifier(raw_ip)


def _assert_worldcup_pin_attempt_allowed(
    cur,
    *,
    pool_id: int,
    owner_type: str,
    email: str,
) -> None:
    email_hash = _hash_login_identifier(email)

    cur.execute(
        """
          SELECT COUNT(*)::int
          FROM worldcup_pool.pin_attempts
          WHERE pool_id = %s
            AND owner_type = %s
            AND email_hash = %s
            AND success = false
            AND created_at_utc >= NOW() - (%s::text || ' minutes')::interval
        """,
        (pool_id, owner_type, email_hash, PIN_LOCK_WINDOW_MINUTES),
    )

    failed_attempts = int((cur.fetchone() or [0])[0] or 0)

    if failed_attempts >= PIN_MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail={
                "ok": False,
                "code": "PIN_ATTEMPTS_LIMIT_EXCEEDED",
                "message": "Too many invalid PIN attempts. Try again later.",
            },
        )

def _assert_worldcup_pool_create_allowed(
    cur,
    *,
    organizer_email: str,
) -> None:
    email = str(organizer_email or "").strip().lower()

    cur.execute(
        """
          SELECT COUNT(*)::int
          FROM worldcup_pool.pools
          WHERE lower(organizer_email) = lower(%s)
            AND created_at_utc >= NOW() - (%s::text || ' minutes')::interval
        """,
        (email, POOL_CREATE_EMAIL_WINDOW_MINUTES),
    )

    email_creations = int((cur.fetchone() or [0])[0] or 0)

    if email_creations >= POOL_CREATE_EMAIL_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_CREATE_RATE_LIMITED",
                "message": "Too many pools created with this email. Try again later.",
            },
        )

    cur.execute(
        """
          SELECT COUNT(*)::int
          FROM worldcup_pool.pools
          WHERE created_at_utc >= NOW() - (%s::text || ' minutes')::interval
        """,
        (POOL_CREATE_GLOBAL_WINDOW_MINUTES,),
    )

    global_creations = int((cur.fetchone() or [0])[0] or 0)

    if global_creations >= POOL_CREATE_GLOBAL_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_CREATE_TEMPORARILY_LIMITED",
                "message": "Pool creation is temporarily limited. Try again later.",
            },
        )

def _record_worldcup_pin_attempt(
    cur,
    *,
    pool_id: int,
    owner_type: str,
    email: str,
    request: Request,
    success: bool,
    failure_code: Optional[str] = None,
) -> None:
    cur.execute(
        """
          INSERT INTO worldcup_pool.pin_attempts (
            pool_id,
            owner_type,
            email_hash,
            ip_hash,
            success,
            failure_code
          )
          VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            pool_id,
            owner_type,
            _hash_login_identifier(email),
            _client_ip_hash(request),
            bool(success),
            failure_code,
        ),
    )


def _clear_worldcup_pin_failures(
    cur,
    *,
    pool_id: int,
    owner_type: str,
    email: str,
) -> None:
    cur.execute(
        """
          DELETE FROM worldcup_pool.pin_attempts
          WHERE pool_id = %s
            AND owner_type = %s
            AND email_hash = %s
            AND success = false
        """,
        (pool_id, owner_type, _hash_login_identifier(email)),
    )


def _build_invite_url(*, origin: str, lang: str, invite_token: str) -> str:
    clean_origin = origin.rstrip("/")
    return f"{clean_origin}/{lang}/bolao/copa/entrar/{invite_token}"

def _build_admin_url(*, origin: str, lang: str, slug: str) -> str:
    clean_origin = origin.rstrip("/")
    return f"{clean_origin}/{lang}/bolao/copa/admin/{slug}"

def _build_participant_panel_url(*, origin: str, lang: str, invite_token: str) -> str:
    clean_origin = origin.rstrip("/")
    return f"{clean_origin}/{lang}/bolao/copa/painel/{invite_token}"

def _make_worldcup_pool_pin() -> str:
    return f"{secrets.randbelow(10000):04d}"


def _coerce_worldcup_email_lang(lang: str | None) -> str:
    raw = str(lang or "").strip().lower()
    if raw.startswith("en"):
        return "en"
    if raw.startswith("es"):
        return "es"
    return "pt"


def _build_worldcup_pool_access_email(
    *,
    lang: str | None,
    pool_name: str,
    invite_url: str,
    admin_url: Optional[str] = None,
) -> dict[str, str]:
    lang_key = _coerce_worldcup_email_lang(lang)
    safe_pool_name = escape(pool_name)
    safe_invite_url = escape(invite_url)

    if lang_key == "en":
        subject = f"Your access to {pool_name} - prevIA World Cup Pool"
        text_body = (
            f"Hello!\n\n"
            f"Your access to the pool \"{pool_name}\" is ready.\n\n"
            f"Pool link:\n{invite_url}\n\n"
            f"Use this same link to manage the pool if you are the organizer, or to make your predictions if you are a participant.\n\n"
            f"Keep this email so you can find your pool link later.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>Hello!</p>
            <p>Your access to the pool <strong>{safe_pool_name}</strong> is ready.</p>
            <p><strong>Pool link:</strong><br /><a href="{safe_invite_url}">{safe_invite_url}</a></p>
            <p>Use this same link to manage the pool if you are the organizer, or to make your predictions if you are a participant.</p>
            <p>Keep this email so you can find your pool link later.</p>
          </body>
        </html>
        """.strip()
        return {"subject": subject, "text_body": text_body, "html_body": html_body}

    if lang_key == "es":
        subject = f"Tu acceso a {pool_name} - Porra del Mundial prevIA"
        text_body = (
            f"¡Hola!\n\n"
            f"Tu acceso a la porra \"{pool_name}\" está listo.\n\n"
            f"Enlace de la porra:\n{invite_url}\n\n"
            f"Usa este mismo enlace para gestionar la porra si eres el organizador, o para hacer tus pronósticos si eres participante.\n\n"
            f"Guarda este email para encontrar el enlace de la porra más tarde.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>¡Hola!</p>
            <p>Tu acceso a la porra <strong>{safe_pool_name}</strong> está listo.</p>
            <p><strong>Enlace de la porra:</strong><br /><a href="{safe_invite_url}">{safe_invite_url}</a></p>
            <p>Usa este mismo enlace para gestionar la porra si eres el organizador, o para hacer tus pronósticos si eres participante.</p>
            <p>Guarda este email para encontrar el enlace de la porra más tarde.</p>
          </body>
        </html>
        """.strip()
        return {"subject": subject, "text_body": text_body, "html_body": html_body}

    subject = f"Seu acesso ao {pool_name} - Bolão da Copa prevIA"
    text_body = (
        f"Olá!\n\n"
        f"Seu acesso ao bolão \"{pool_name}\" está pronto.\n\n"
        f"Link do bolão:\n{invite_url}\n\n"
        f"Use esse mesmo link para gerenciar o bolão se você for o organizador, ou para fazer seus palpites se você for participante.\n\n"
        f"Guarde este e-mail para encontrar o link do bolão depois.\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111;">
        <p>Olá!</p>
        <p>Seu acesso ao bolão <strong>{safe_pool_name}</strong> está pronto.</p>
        <p><strong>Link do bolão:</strong><br /><a href="{safe_invite_url}">{safe_invite_url}</a></p>
        <p>Use esse mesmo link para gerenciar o bolão se você for o organizador, ou para fazer seus palpites se você for participante.</p>
        <p>Guarde este e-mail para encontrar o link do bolão depois.</p>
      </body>
    </html>
    """.strip()
    return {"subject": subject, "text_body": text_body, "html_body": html_body}


def _build_worldcup_pool_pin_reset_email(
    *,
    lang: str | None,
    pool_name: str,
    new_pin: str,
    invite_url: Optional[str],
    admin_url: Optional[str],
) -> dict[str, str]:
    lang_key = _coerce_worldcup_email_lang(lang)
    safe_pool_name = escape(pool_name)
    safe_pin = escape(new_pin)
    safe_invite_url = escape(invite_url or "")

    if lang_key == "en":
        subject = "Your new World Cup Pool PIN"
        text_body = (
            f"Hello!\n\n"
            f"We received a request to recover access to the pool \"{pool_name}\".\n\n"
            f"Your new PIN is: {new_pin}\n\n"
            + (f"Pool link:\n{invite_url}\n\n" if invite_url else "")
            + "Use this PIN with your email. The same pool link opens the organizer dashboard or the prediction screen according to your access.\n\n"
            + "If you did not request this, you can ignore this email.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>Hello!</p>
            <p>We received a request to recover access to the pool <strong>{safe_pool_name}</strong>.</p>
            <p style="font-size: 20px;"><strong>Your new PIN is: {safe_pin}</strong></p>
            {f'<p><strong>Pool link:</strong><br /><a href="{safe_invite_url}">{safe_invite_url}</a></p>' if invite_url else ''}
            <p>Use this PIN with your email. The same pool link opens the organizer dashboard or the prediction screen according to your access.</p>
            <p>If you did not request this, you can ignore this email.</p>
          </body>
        </html>
        """.strip()
        return {"subject": subject, "text_body": text_body, "html_body": html_body}

    if lang_key == "es":
        subject = "Tu nuevo PIN de la Porra del Mundial"
        text_body = (
            f"¡Hola!\n\n"
            f"Recibimos una solicitud para recuperar el acceso a la porra \"{pool_name}\".\n\n"
            f"Tu nuevo PIN es: {new_pin}\n\n"
            + (f"Enlace de la porra:\n{invite_url}\n\n" if invite_url else "")
            + "Usa este PIN con tu email. El mismo enlace abre el panel del organizador o la pantalla de pronósticos según tu acceso.\n\n"
            + "Si no solicitaste esto, puedes ignorar este email.\n"
        )
        html_body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #111;">
            <p>¡Hola!</p>
            <p>Recibimos una solicitud para recuperar el acceso a la porra <strong>{safe_pool_name}</strong>.</p>
            <p style="font-size: 20px;"><strong>Tu nuevo PIN es: {safe_pin}</strong></p>
            {f'<p><strong>Enlace de la porra:</strong><br /><a href="{safe_invite_url}">{safe_invite_url}</a></p>' if invite_url else ''}
            <p>Usa este PIN con tu email. El mismo enlace abre el panel del organizador o la pantalla de pronósticos según tu acceso.</p>
            <p>Si no solicitaste esto, puedes ignorar este email.</p>
          </body>
        </html>
        """.strip()
        return {"subject": subject, "text_body": text_body, "html_body": html_body}

    subject = "Seu novo PIN do Bolão da Copa"
    text_body = (
        f"Olá!\n\n"
        f"Recebemos uma solicitação para recuperar o acesso ao bolão \"{pool_name}\".\n\n"
        f"Seu novo PIN é: {new_pin}\n\n"
        + (f"Link do bolão:\n{invite_url}\n\n" if invite_url else "")
        + "Use este PIN junto com seu e-mail. O mesmo link abre o painel do organizador ou a tela de palpites conforme seu acesso.\n\n"
        + "Se você não solicitou isso, ignore este e-mail.\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #111;">
        <p>Olá!</p>
        <p>Recebemos uma solicitação para recuperar o acesso ao bolão <strong>{safe_pool_name}</strong>.</p>
        <p style="font-size: 20px;"><strong>Seu novo PIN é: {safe_pin}</strong></p>
        {f'<p><strong>Link do bolão:</strong><br /><a href="{safe_invite_url}">{safe_invite_url}</a></p>' if invite_url else ''}
        <p>Use este PIN junto com seu e-mail. O mesmo link abre o painel do organizador ou a tela de palpites conforme seu acesso.</p>
        <p>Se você não solicitou isso, ignore este e-mail.</p>
      </body>
    </html>
    """.strip()
    return {"subject": subject, "text_body": text_body, "html_body": html_body}


def _send_worldcup_pool_access_email_safely(
    *,
    to_email: str,
    lang: str | None,
    pool_name: str,
    invite_url: str,
    admin_url: Optional[str] = None,
) -> bool:
    try:
        payload = _build_worldcup_pool_access_email(
            lang=lang,
            pool_name=pool_name,
            invite_url=invite_url,
            admin_url=admin_url,
        )
        send_product_email(
            to_email=to_email,
            subject=payload["subject"],
            text_body=payload["text_body"],
            html_body=payload["html_body"],
        )
        return True
    except Exception as exc:
        print(f"worldcup_pool_access_email_failed: {exc}")
        return False

def _iso(value) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    return str(value)

def _pool_invite_from_row(row) -> WorldCupPoolInvitePool:
    return WorldCupPoolInvitePool(
        id=int(row[0]),
        slug=str(row[1]),
        name=str(row[2]),
        lang=row[3],
        scoring_mode=_normalize_worldcup_scoring_mode(row[5]),
        status=str(row[4]),
        participant_count=int(row[6] or 0),
    )

def _require_participant_context(
    invite_token: str,
    request: Request,
) -> tuple[WorldCupPoolInvitePool, WorldCupPoolDashboardParticipant]:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    session_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=settings.worldcup_pool_participant_session_cookie_name,
    )
    if not session_tokens:
        raise HTTPException(
            status_code=401,
            detail={
                "ok": False,
                "code": "PARTICIPANT_SESSION_REQUIRED",
                "message": "Participant session is required.",
            },
        )

    token = str(invite_token or "").strip()
    session_token_hashes = [_hash_session_token(session_token) for session_token in session_tokens]

    sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        COUNT(DISTINCT active_pt.id) FILTER (WHERE active_pt.status = 'active') AS participant_count,
        participant.id,
        participant.display_name,
        participant.email,
        participant.status,
        participant.joined_at_utc,
        participant.last_seen_at_utc,
        s.session_token_hash
      FROM worldcup_pool.sessions s
      JOIN worldcup_pool.pools p
        ON p.id = s.pool_id
      JOIN worldcup_pool.participants participant
        ON participant.id = s.participant_id
       AND participant.pool_id = p.id
      LEFT JOIN worldcup_pool.participants active_pt
        ON active_pt.pool_id = p.id
      WHERE s.session_token_hash = ANY(%s) 
        AND s.owner_type = 'participant'
        AND s.revoked_at_utc IS NULL
        AND s.expires_at_utc > NOW()
        AND p.invite_token = %s
        AND p.status = 'active'
        AND participant.status = 'active'
      GROUP BY
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        participant.id,
        participant.display_name,
        participant.email,
        participant.status,
        participant.joined_at_utc,
        participant.last_seen_at_utc,
        s.session_token_hash
      LIMIT 1
    """

    update_session_sql = """
      UPDATE worldcup_pool.sessions
      SET last_seen_at_utc = NOW()
      WHERE session_token_hash = %s
    """

    update_participant_sql = """
      UPDATE worldcup_pool.participants
      SET last_seen_at_utc = NOW()
      WHERE id = %s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (session_token_hashes, token))
                row = cur.fetchone()

                if not row:
                    raise HTTPException(
                        status_code=401,
                        detail={
                            "ok": False,
                            "code": "INVALID_PARTICIPANT_SESSION",
                            "message": "Invalid participant session for this pool.",
                        },
                    )

                cur.execute(update_session_sql, (str(row[13]),))
                cur.execute(update_participant_sql, (int(row[7]),))

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "PARTICIPANT_SESSION_LOOKUP_FAILED",
                "message": f"Failed to validate participant session: {e}",
            },
        )

    pool = WorldCupPoolInvitePool(
        id=int(row[0]),
        slug=str(row[1]),
        name=str(row[2]),
        lang=row[3],
        scoring_mode=_normalize_worldcup_scoring_mode(row[5]),
        status=str(row[4]),
        participant_count=int(row[6] or 0),
    )

    participant = WorldCupPoolDashboardParticipant(
        id=int(row[7]),
        display_name=str(row[8]),
        email=str(row[9]),
        status=str(row[10]),
        joined_at_utc=_iso(row[11]),
        last_seen_at_utc=_iso(row[12]),
    )

    return pool, participant

def _split_worldcup_session_cookie_value(raw_value: str | None) -> list[str]:
    values: list[str] = []
    for item in str(raw_value or "").split("."):
        token = item.strip()
        if token and token not in values:
            values.append(token)
    return values

def _get_worldcup_pool_session_token_candidates(
    *,
    request: Request,
    cookie_name: str,
) -> list[str]:
    values: list[str] = []
    raw_cookie = request.headers.get("cookie") or ""

    for part in raw_cookie.split(";"):
        name, sep, value = part.strip().partition("=")
        if sep and name == cookie_name:
            for token in _split_worldcup_session_cookie_value(value.strip()):
                if token not in values:
                    values.append(token)

    parsed_value = request.cookies.get(cookie_name)
    for token in _split_worldcup_session_cookie_value(parsed_value):
        if token not in values:
            values.append(token)

    return values


def _write_worldcup_pool_session_cookie_value(
    *,
    response: Response,
    cookie_name: str,
    tokens: list[str],
    max_age_seconds: int,
    path: str,
) -> None:
    settings = load_settings()
    clean_tokens: list[str] = []

    for token in tokens:
        clean_token = str(token or "").strip()
        if clean_token and clean_token not in clean_tokens:
            clean_tokens.append(clean_token)

    clean_tokens = clean_tokens[-WORLDCUP_POOL_SESSION_COOKIE_MAX_TOKENS:]

    if not clean_tokens:
        _clear_worldcup_pool_session_cookie(
            response=response,
            cookie_name=cookie_name,
            path=path,
        )
        return

    response.set_cookie(
        key=cookie_name,
        value=".".join(clean_tokens),
        max_age=max_age_seconds,
        httponly=True,
        secure=settings.product_session_cookie_secure,
        samesite=settings.product_session_cookie_samesite,
        domain=settings.product_session_cookie_domain or None,
        path=path,
    )


def _set_worldcup_pool_session_cookie(
    *,
    response: Response,
    cookie_name: str,
    token: str,
    max_age_seconds: int,
    path: str,
    request: Optional[Request] = None,
) -> None:
    tokens = (
        _get_worldcup_pool_session_token_candidates(
            request=request,
            cookie_name=cookie_name,
        )
        if request is not None
        else []
    )

    tokens = [existing for existing in tokens if existing != token] + [token]

    _write_worldcup_pool_session_cookie_value(
        response=response,
        cookie_name=cookie_name,
        tokens=tokens,
        max_age_seconds=max_age_seconds,
        path=path,
    )


def _append_worldcup_pool_session_tokens_to_cookie(
    *,
    request: Request,
    response: Response,
    cookie_name: str,
    tokens: list[str],
    max_age_seconds: int,
    path: str,
) -> None:
    existing_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=cookie_name,
    )

    merged_tokens = [token for token in existing_tokens]
    for token in tokens:
        clean_token = str(token or "").strip()
        if clean_token:
            merged_tokens = [existing for existing in merged_tokens if existing != clean_token]
            merged_tokens.append(clean_token)

    _write_worldcup_pool_session_cookie_value(
        response=response,
        cookie_name=cookie_name,
        tokens=merged_tokens,
        max_age_seconds=max_age_seconds,
        path=path,
    )


def _remove_worldcup_pool_session_tokens_from_cookie(
    *,
    request: Request,
    response: Response,
    cookie_name: str,
    revoked_token_hashes: set[str],
    max_age_seconds: int,
    path: str,
) -> None:
    if not revoked_token_hashes:
        return

    remaining_tokens = [
        token
        for token in _get_worldcup_pool_session_token_candidates(
            request=request,
            cookie_name=cookie_name,
        )
        if _hash_session_token(token) not in revoked_token_hashes
    ]

    _write_worldcup_pool_session_cookie_value(
        response=response,
        cookie_name=cookie_name,
        tokens=remaining_tokens,
        max_age_seconds=max_age_seconds,
        path=path,
    )

def _clear_worldcup_pool_session_cookie(
    *,
    response: Response,
    cookie_name: str,
    path: str,
) -> None:
    settings = load_settings()

    # O bolão usa o cookie reservado __session por causa do Firebase Hosting.
    # Em produção já tivemos cookies legados com paths/domínios diferentes.
    # Para apagar cookie no browser, Path e Domain precisam bater exatamente;
    # por isso limpamos o escopo atual e os legados conhecidos antes de gravar
    # uma sessão nova.
    paths: list[str] = []
    for cookie_path in [
        path,
        WORLDCUP_POOL_COOKIE_PATH,
        "/",
        "/public",
        "/public/worldcup-pool/pools",
        "/public/worldcup-pool/invites",
    ]:
        clean_path = str(cookie_path or "").strip() or "/"
        if clean_path not in paths:
            paths.append(clean_path)

    domains: list[Optional[str]] = [None]
    for cookie_domain in [
        settings.product_session_cookie_domain,
        ".previa.bet",
        "previa.bet",
        "api.previa.bet",
    ]:
        clean_domain = str(cookie_domain or "").strip()
        if clean_domain and clean_domain not in domains:
            domains.append(clean_domain)

    for cookie_path in paths:
        for cookie_domain in domains:
            kwargs = {
                "key": cookie_name,
                "path": cookie_path,
                "secure": settings.product_session_cookie_secure,
                "httponly": True,
                "samesite": settings.product_session_cookie_samesite,
            }
            if cookie_domain is not None:
                kwargs["domain"] = cookie_domain

            response.delete_cookie(**kwargs)

@router.get("/me/pools", response_model=WorldCupPoolMyPoolsResponse)
def list_worldcup_pool_my_pools(request: Request) -> WorldCupPoolMyPoolsResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    participant_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=settings.worldcup_pool_participant_session_cookie_name,
    )
    organizer_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
    )

    participant_token_hashes = [
        _hash_session_token(token) for token in participant_tokens
    ]
    organizer_token_hashes = [
        _hash_session_token(token) for token in organizer_tokens
    ]

    if not participant_token_hashes and not organizer_token_hashes:
        return WorldCupPoolMyPoolsResponse(ok=True, pools=[])

    participant_sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        COUNT(DISTINCT active_pt.id) FILTER (WHERE active_pt.status = 'active') AS participant_count,
        pt.id AS participant_id,
        pt.display_name AS participant_display_name,
        COUNT(DISTINCT pr.id)::int AS predictions_count,
        (
          SELECT COUNT(*)::int
          FROM worldcup_pool.matches m
          WHERE m.competition_key = 'fifa_world_cup_2026'
            AND m.status <> 'cancelled'
        ) AS available_matches,
        MAX(s.session_token_hash) AS session_token_hash
      FROM worldcup_pool.sessions s
      JOIN worldcup_pool.pools p
        ON p.id = s.pool_id
      JOIN worldcup_pool.participants pt
        ON pt.id = s.participant_id
       AND pt.pool_id = p.id
      LEFT JOIN worldcup_pool.participants active_pt
        ON active_pt.pool_id = p.id
      LEFT JOIN worldcup_pool.predictions pr
        ON pr.pool_id = p.id
       AND pr.participant_id = pt.id
      WHERE s.session_token_hash = ANY(%s)
        AND s.owner_type = 'participant'
        AND s.revoked_at_utc IS NULL
        AND s.expires_at_utc > NOW()
        AND p.status = 'active'
        AND pt.status = 'active'
      GROUP BY
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        pt.id,
        pt.display_name
    """

    organizer_sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        COUNT(DISTINCT active_pt.id) FILTER (WHERE active_pt.status = 'active') AS participant_count,
        own_pt.id AS participant_id,
        own_pt.display_name AS participant_display_name,
        COUNT(DISTINCT pr.id)::int AS predictions_count,
        (
          SELECT COUNT(*)::int
          FROM worldcup_pool.matches m
          WHERE m.competition_key = 'fifa_world_cup_2026'
            AND m.status <> 'cancelled'
        ) AS available_matches,
        MAX(s.session_token_hash) AS session_token_hash
      FROM worldcup_pool.sessions s
      JOIN worldcup_pool.pools p
        ON p.id = s.pool_id
      LEFT JOIN worldcup_pool.participants active_pt
        ON active_pt.pool_id = p.id
      LEFT JOIN worldcup_pool.participants own_pt
        ON own_pt.pool_id = p.id
       AND lower(own_pt.email) = lower(p.organizer_email)
       AND own_pt.status = 'active'
      LEFT JOIN worldcup_pool.predictions pr
        ON pr.pool_id = p.id
       AND pr.participant_id = own_pt.id
      WHERE s.session_token_hash = ANY(%s)
        AND s.owner_type = 'organizer'
        AND s.revoked_at_utc IS NULL
        AND s.expires_at_utc > NOW()
        AND p.status = 'active'
      GROUP BY
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        own_pt.id,
        own_pt.display_name
    """

    update_seen_sql = """
      UPDATE worldcup_pool.sessions
      SET last_seen_at_utc = NOW()
      WHERE session_token_hash = ANY(%s)
    """

    merged: dict[int, dict] = {}
    seen_hashes: set[str] = set()

    def merge_row(row, role: WorldCupPoolAccessRole) -> None:
        pool_id = int(row[0])
        item = merged.get(pool_id)

        if not item:
            invite_url = _build_invite_url(
                origin=settings.product_public_origin,
                lang=str(row[3]),
                invite_token=str(row[6]),
            )
            admin_url = _build_admin_url(
                origin=settings.product_public_origin,
                lang=str(row[3]),
                slug=str(row[1]),
            )
            participant_url = _build_participant_panel_url(
                origin=settings.product_public_origin,
                lang=str(row[3]),
                invite_token=str(row[6]),
            )

            item = {
                "id": pool_id,
                "slug": str(row[1]),
                "name": str(row[2]),
                "lang": row[3],
                "status": str(row[4]),
                "scoring_mode": _normalize_worldcup_scoring_mode(row[5]),
                "invite_token": str(row[6]),
                "invite_url": invite_url,
                "admin_url": admin_url,
                "participant_url": participant_url,
                "participant_count": int(row[7] or 0),
                "roles": [],
                "participant_id": None,
                "participant_display_name": None,
                "predictions_count": 0,
                "available_matches": int(row[11] or 0),
            }
            merged[pool_id] = item

        if role not in item["roles"]:
            item["roles"].append(role)

        if role == "organizer" and row[8] is not None and "participant" not in item["roles"]:
            item["roles"].append("participant")

        if row[8] is not None:
            item["participant_id"] = int(row[8])
            item["participant_display_name"] = str(row[9]) if row[9] is not None else None
            item["predictions_count"] = int(row[10] or 0)

        if row[12] is not None:
            seen_hashes.add(str(row[12]))

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                if participant_token_hashes:
                    cur.execute(participant_sql, (participant_token_hashes,))
                    for row in cur.fetchall():
                        merge_row(row, "participant")

                if organizer_token_hashes:
                    cur.execute(organizer_sql, (organizer_token_hashes,))
                    for row in cur.fetchall():
                        merge_row(row, "organizer")

                if seen_hashes:
                    cur.execute(update_seen_sql, (list(seen_hashes),))

            conn.commit()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_MY_POOLS_FAILED",
                "message": f"Failed to list authenticated pools: {e}",
            },
        )

    pools = []

    for item in merged.values():
        roles = item["roles"]
        roles.sort(key=lambda role: 0 if role == "organizer" else 1)
        primary_role: WorldCupPoolAccessRole = "organizer" if "organizer" in roles else "participant"

        pools.append(
            WorldCupPoolMyPool(
                id=item["id"],
                slug=item["slug"],
                name=item["name"],
                lang=item["lang"],
                scoring_mode=item["scoring_mode"],
                status=item["status"],
                invite_token=item["invite_token"],
                invite_url=item["invite_url"],
                admin_url=item["admin_url"],
                participant_url=item["participant_url"],
                participant_count=item["participant_count"],
                roles=roles,
                primary_role=primary_role,
                participant_id=item["participant_id"],
                participant_display_name=item["participant_display_name"],
                predictions_count=item["predictions_count"],
                available_matches=item["available_matches"],
            )
        )

    pools.sort(key=lambda pool: (pool.name.lower(), pool.id))

    return WorldCupPoolMyPoolsResponse(ok=True, pools=pools)

@router.post("/access/reset-session", response_model=WorldCupPoolLogoutResponse)
def reset_worldcup_pool_access_session(response: Response) -> WorldCupPoolLogoutResponse:
    settings = load_settings()

    for cookie_name in {
        settings.worldcup_pool_organizer_session_cookie_name,
        settings.worldcup_pool_participant_session_cookie_name,
    }:
        _clear_worldcup_pool_session_cookie(
            response=response,
            cookie_name=cookie_name,
            path=WORLDCUP_POOL_COOKIE_PATH,
        )

    return WorldCupPoolLogoutResponse(ok=True)

@router.post("/access/login", response_model=WorldCupPoolMyPoolsResponse)
def login_worldcup_pool_access(
    req: WorldCupPoolAccessLoginRequest,
    request: Request,
    response: Response,
) -> WorldCupPoolMyPoolsResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    _validate_pin(req.pin)

    for cookie_name in {
        settings.worldcup_pool_organizer_session_cookie_name,
        settings.worldcup_pool_participant_session_cookie_name,
    }:
        _clear_worldcup_pool_session_cookie(
            response=response,
            cookie_name=cookie_name,
            path=WORLDCUP_POOL_COOKIE_PATH,
        )

    email = str(req.email).strip().lower()
    pin = str(req.pin or "")
    invite_token = str(req.invite_token or "").strip()
    session_cookie_max_age_seconds = settings.worldcup_pool_session_ttl_days * 24 * 60 * 60
    expires_at_utc = _now_utc() + timedelta(days=settings.worldcup_pool_session_ttl_days)
    user_agent: Optional[str] = request.headers.get("user-agent")
    safe_user_agent = user_agent[:500] if user_agent else None

    candidate_sql = """
      SELECT
        'organizer' AS role,
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        p.organizer_email AS login_email,
        p.organizer_pin_hash AS pin_hash,
        own_pt.id AS participant_id,
        own_pt.display_name AS participant_display_name,
        COUNT(DISTINCT active_pt.id) FILTER (WHERE active_pt.status = 'active') AS participant_count,
        COUNT(DISTINCT pr.id)::int AS predictions_count,
        (
          SELECT COUNT(*)::int
          FROM worldcup_pool.matches m
          WHERE m.competition_key = 'fifa_world_cup_2026'
            AND m.status <> 'cancelled'
        ) AS available_matches
      FROM worldcup_pool.pools p
      LEFT JOIN worldcup_pool.participants active_pt
        ON active_pt.pool_id = p.id
      LEFT JOIN worldcup_pool.participants own_pt
        ON own_pt.pool_id = p.id
       AND lower(own_pt.email) = lower(p.organizer_email)
       AND own_pt.status = 'active'
      LEFT JOIN worldcup_pool.predictions pr
        ON pr.pool_id = p.id
       AND pr.participant_id = own_pt.id
      WHERE lower(p.organizer_email) = lower(%s)
        AND p.status = 'active'
        AND (%s = '' OR p.invite_token = %s)
      GROUP BY
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        p.organizer_email,
        p.organizer_pin_hash,
        own_pt.id,
        own_pt.display_name

      UNION ALL

      SELECT
        'participant' AS role,
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        pt.email AS login_email,
        pt.pin_hash AS pin_hash,
        pt.id AS participant_id,
        pt.display_name AS participant_display_name,
        COUNT(DISTINCT active_pt.id) FILTER (WHERE active_pt.status = 'active') AS participant_count,
        COUNT(DISTINCT pr.id)::int AS predictions_count,
        (
          SELECT COUNT(*)::int
          FROM worldcup_pool.matches m
          WHERE m.competition_key = 'fifa_world_cup_2026'
            AND m.status <> 'cancelled'
        ) AS available_matches
      FROM worldcup_pool.participants pt
      JOIN worldcup_pool.pools p
        ON p.id = pt.pool_id
      LEFT JOIN worldcup_pool.participants active_pt
        ON active_pt.pool_id = p.id
      LEFT JOIN worldcup_pool.predictions pr
        ON pr.pool_id = p.id
       AND pr.participant_id = pt.id
      WHERE lower(pt.email) = lower(%s)
        AND pt.status = 'active'
        AND p.status = 'active'
        AND (%s = '' OR p.invite_token = %s)
      GROUP BY
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        pt.email,
        pt.pin_hash,
        pt.id,
        pt.display_name
    """

    insert_session_sql = """
      INSERT INTO worldcup_pool.sessions (
        pool_id,
        participant_id,
        owner_type,
        session_token_hash,
        user_agent,
        expires_at_utc
      )
      VALUES (%s, %s, %s, %s, %s, %s)
    """

    update_participant_seen_sql = """
      UPDATE worldcup_pool.participants
      SET last_seen_at_utc = NOW()
      WHERE id = %s
    """

    insert_event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (%s, %s, %s, %s, %s, %s::jsonb)
    """

    matched_rows: list[tuple[tuple, WorldCupPoolAccessRole]] = []
    session_tokens_by_cookie: dict[str, dict[str, object]] = {}

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    candidate_sql,
                    (
                        email,
                        invite_token,
                        invite_token,
                        email,
                        invite_token,
                        invite_token,
                    ),
                )
                candidate_rows = cur.fetchall()

                for row in candidate_rows:
                    role: WorldCupPoolAccessRole = "organizer" if str(row[0]) == "organizer" else "participant"
                    if _verify_pin(pin, str(row[9])):
                        matched_rows.append((row, role))

                if not matched_rows:
                    for row in candidate_rows:
                        role = "organizer" if str(row[0]) == "organizer" else "participant"
                        pool_id = int(row[1])
                        _assert_worldcup_pin_attempt_allowed(
                            cur,
                            pool_id=pool_id,
                            owner_type=role,
                            email=email,
                        )
                        _record_worldcup_pin_attempt(
                            cur,
                            pool_id=pool_id,
                            owner_type=role,
                            email=email,
                            request=request,
                            success=False,
                            failure_code="invalid_access_login",
                        )

                    conn.commit()

                    raise HTTPException(
                        status_code=401,
                        detail={
                            "ok": False,
                            "code": "INVALID_WORLDCUP_POOL_ACCESS_LOGIN",
                            "message": "No active pool was found for this email and PIN.",
                        },
                    )

                for row, role in matched_rows:
                    pool_id = int(row[1])
                    participant_id = int(row[10]) if role == "participant" and row[10] is not None else None

                    _assert_worldcup_pin_attempt_allowed(
                        cur,
                        pool_id=pool_id,
                        owner_type=role,
                        email=email,
                    )
                    _clear_worldcup_pin_failures(
                        cur,
                        pool_id=pool_id,
                        owner_type=role,
                        email=email,
                    )
                    _record_worldcup_pin_attempt(
                        cur,
                        pool_id=pool_id,
                        owner_type=role,
                        email=email,
                        request=request,
                        success=True,
                    )

                    if participant_id is not None:
                        cur.execute(update_participant_seen_sql, (participant_id,))

                    session_token = secrets.token_urlsafe(32)
                    session_token_hash = _hash_session_token(session_token)

                    cur.execute(
                        insert_session_sql,
                        (
                            pool_id,
                            participant_id,
                            role,
                            session_token_hash,
                            safe_user_agent,
                            expires_at_utc,
                        ),
                    )

                    cur.execute(
                        insert_event_sql,
                        (
                            pool_id,
                            participant_id,
                            role,
                            participant_id if participant_id is not None else pool_id,
                            "participant_logged_in" if role == "participant" else "organizer_logged_in",
                            json.dumps(
                                {
                                    "email": email,
                                    "source": "public_worldcup_pool_access_login",
                                }
                            ),
                        ),
                    )

                    if role == "organizer":
                        cookie_name = settings.worldcup_pool_organizer_session_cookie_name
                        cookie_path = WORLDCUP_POOL_ORGANIZER_COOKIE_PATH
                    else:
                        cookie_name = settings.worldcup_pool_participant_session_cookie_name
                        cookie_path = WORLDCUP_POOL_PARTICIPANT_COOKIE_PATH

                    if (
                        settings.worldcup_pool_organizer_session_cookie_name
                        == settings.worldcup_pool_participant_session_cookie_name
                    ):
                        cookie_path = WORLDCUP_POOL_COOKIE_PATH

                    grouped = session_tokens_by_cookie.setdefault(
                        cookie_name,
                        {
                            "path": cookie_path,
                            "tokens": [],
                        },
                    )
                    grouped_tokens = grouped["tokens"]
                    if isinstance(grouped_tokens, list):
                        grouped_tokens.append(session_token)

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_ACCESS_LOGIN_FAILED",
                "message": f"Failed to login to World Cup Pool access: {e}",
            },
        )

    for cookie_name, grouped in session_tokens_by_cookie.items():
        tokens = grouped.get("tokens") if isinstance(grouped, dict) else []
        cookie_path = grouped.get("path") if isinstance(grouped, dict) else WORLDCUP_POOL_COOKIE_PATH

        # Login global é uma reautenticação explícita do usuário.
        # Por isso, ele deve substituir tokens antigos do bolão em vez de anexar
        # indefinidamente ao __session. Isso evita cookies legados/parciais
        # impedindo acesso a bolões recém-logados.
        _write_worldcup_pool_session_cookie_value(
            response=response,
            cookie_name=cookie_name,
            tokens=tokens if isinstance(tokens, list) else [],
            max_age_seconds=session_cookie_max_age_seconds,
            path=str(cookie_path or WORLDCUP_POOL_COOKIE_PATH),
        )

    merged: dict[int, dict] = {}

    for row, role in matched_rows:
        pool_id = int(row[1])
        item = merged.get(pool_id)

        if not item:
            invite_url = _build_invite_url(
                origin=settings.product_public_origin,
                lang=str(row[4]),
                invite_token=str(row[7]),
            )
            admin_url = _build_admin_url(
                origin=settings.product_public_origin,
                lang=str(row[4]),
                slug=str(row[2]),
            )
            participant_url = _build_participant_panel_url(
                origin=settings.product_public_origin,
                lang=str(row[4]),
                invite_token=str(row[7]),
            )

            item = {
                "id": pool_id,
                "slug": str(row[2]),
                "name": str(row[3]),
                "lang": row[4],
                "status": str(row[5]),
                "scoring_mode": _normalize_worldcup_scoring_mode(row[6]),
                "invite_token": str(row[7]),
                "invite_url": invite_url,
                "admin_url": admin_url,
                "participant_url": participant_url,
                "participant_count": int(row[12] or 0),
                "roles": [],
                "participant_id": None,
                "participant_display_name": None,
                "predictions_count": 0,
                "available_matches": int(row[14] or 0),
            }
            merged[pool_id] = item

        if role not in item["roles"]:
            item["roles"].append(role)

        if role == "organizer" and row[10] is not None and "participant" not in item["roles"]:
            item["roles"].append("participant")

        if row[10] is not None:
            item["participant_id"] = int(row[10])
            item["participant_display_name"] = str(row[11]) if row[11] is not None else None
            item["predictions_count"] = int(row[13] or 0)

    pools: list[WorldCupPoolMyPool] = []

    for item in merged.values():
        roles = item["roles"]
        roles.sort(key=lambda item_role: 0 if item_role == "organizer" else 1)
        primary_role: WorldCupPoolAccessRole = "organizer" if "organizer" in roles else "participant"

        pools.append(
            WorldCupPoolMyPool(
                id=item["id"],
                slug=item["slug"],
                name=item["name"],
                lang=item["lang"],
                scoring_mode=item["scoring_mode"],
                status=item["status"],
                invite_token=item["invite_token"],
                invite_url=item["invite_url"],
                admin_url=item["admin_url"],
                participant_url=item["participant_url"],
                participant_count=item["participant_count"],
                roles=roles,
                primary_role=primary_role,
                participant_id=item["participant_id"],
                participant_display_name=item["participant_display_name"],
                predictions_count=item["predictions_count"],
                available_matches=item["available_matches"],
            )
        )

    pools.sort(key=lambda pool: (pool.name.lower(), pool.id))

    return WorldCupPoolMyPoolsResponse(ok=True, pools=pools)

@router.get("/status", response_model=WorldCupPoolStatusResponse)
def get_worldcup_pool_status() -> WorldCupPoolStatusResponse:
    settings = load_settings()

    return WorldCupPoolStatusResponse(
        ok=True,
        enabled=settings.worldcup_pool_enabled,
        public_create_enabled=settings.worldcup_pool_public_create_enabled,
        join_enabled=settings.worldcup_pool_join_enabled,
        predictions_enabled=settings.worldcup_pool_predictions_enabled,
        readonly_enabled=settings.worldcup_pool_readonly_enabled,
        supported_langs=["pt", "en", "es"],
        scoring=SCORING,
        scoring_mode_default=WORLDCUP_POOL_DEFAULT_SCORING_MODE,
        scoring_modes=_worldcup_available_scoring_modes(),
        localized_copy=COPY,
    )


@router.post("/pools", response_model=WorldCupPoolCreateResponse)
def create_worldcup_pool(
    req: WorldCupPoolCreateRequest,
    request: Request,
    response: Response,
) -> WorldCupPoolCreateResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled or not settings.worldcup_pool_public_create_enabled:
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_CREATE_DISABLED",
                "message": "World Cup Pool creation is disabled.",
            },
        )

    if not req.terms_accepted:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "TERMS_NOT_ACCEPTED",
                "message": "Terms must be accepted to create a pool.",
            },
        )

    _validate_pin(req.organizer_pin)

    pool_name = req.name.strip()
    organizer_name = req.organizer_name.strip()
    organizer_email = str(req.organizer_email).strip().lower()
    lang = req.lang
    scoring_mode = _normalize_worldcup_scoring_mode(req.scoring_mode)

    if len(pool_name) < 3 or len(organizer_name) < 2:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "INVALID_POOL_DATA",
                "message": "Pool name and organizer name are required.",
            },
        )

    base_slug = _normalize_slug(pool_name)
    organizer_pin_hash = _hash_pin(req.organizer_pin)
    creator_participant_pin_hash = _hash_pin(req.organizer_pin)
    invite_token = secrets.token_urlsafe(18)
    organizer_session_token = secrets.token_urlsafe(32)
    participant_session_token = secrets.token_urlsafe(32)
    organizer_session_token_hash = _hash_session_token(organizer_session_token)
    participant_session_token_hash = _hash_session_token(participant_session_token)
    expires_at_utc = _now_utc() + timedelta(days=settings.worldcup_pool_session_ttl_days)
    user_agent: Optional[str] = request.headers.get("user-agent")

    insert_pool_sql = """
      INSERT INTO worldcup_pool.pools (
        slug,
        name,
        lang,
        scoring_mode,
        organizer_name,
        organizer_email,
        organizer_pin_hash,
        invite_token,
        status,
        marketing_opt_in,
        terms_accepted_at_utc
      )
      VALUES (
        %s,
        %s,
        %s,
        %s,
        %s,
        %s,
        %s,
        %s,
        'active',
        %s,
        NOW()
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING id, slug, name, lang, invite_token, scoring_mode
    """

    insert_creator_participant_sql = """
      INSERT INTO worldcup_pool.participants (
        pool_id,
        display_name,
        email,
        pin_hash,
        status,
        marketing_opt_in,
        public_rank_opt_in,
        terms_accepted_at_utc,
        joined_at_utc,
        last_seen_at_utc
      )
      VALUES (
        %s,
        %s,
        %s,
        %s,
        'active',
        %s,
        false,
        NOW(),
        NOW(),
        NOW()
      )
      RETURNING id, display_name, email, status
    """

    insert_session_sql = """
      INSERT INTO worldcup_pool.sessions (
        pool_id,
        participant_id,
        owner_type,
        session_token_hash,
        user_agent,
        expires_at_utc
      )
      VALUES (
        %s,
        %s,
        %s,
        %s,
        %s,
        %s
      )
    """

    insert_event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        %s,
        %s,
        %s,
        %s,
        %s::jsonb
      )
    """

    row = None
    creator_participant_row = None

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                _assert_worldcup_pool_create_allowed(
                    cur,
                    organizer_email=organizer_email,
                )

                for attempt in range(0, 20):
                    candidate_slug = base_slug if attempt == 0 else f"{base_slug}-{attempt + 1}"

                    cur.execute(
                        insert_pool_sql,
                        (
                            candidate_slug,
                            pool_name,
                            lang,
                            scoring_mode,
                            organizer_name,
                            organizer_email,
                            organizer_pin_hash,
                            invite_token,
                            bool(req.marketing_opt_in),
                        ),
                    )
                    row = cur.fetchone()

                    if row:
                        break

                if not row:
                    raise RuntimeError("failed_to_generate_unique_pool_slug")

                pool_id = int(row[0])

                cur.execute(
                    insert_creator_participant_sql,
                    (
                        pool_id,
                        organizer_name,
                        organizer_email,
                        creator_participant_pin_hash,
                        bool(req.marketing_opt_in),
                    ),
                )
                creator_participant_row = cur.fetchone()

                if not creator_participant_row:
                    raise RuntimeError("creator_participant_insert_returned_empty")

                creator_participant_id = int(creator_participant_row[0])
                safe_user_agent = user_agent[:500] if user_agent else None

                cur.execute(
                    insert_session_sql,
                    (
                        pool_id,
                        None,
                        "organizer",
                        organizer_session_token_hash,
                        safe_user_agent,
                        expires_at_utc,
                    ),
                )

                cur.execute(
                    insert_session_sql,
                    (
                        pool_id,
                        creator_participant_id,
                        "participant",
                        participant_session_token_hash,
                        safe_user_agent,
                        expires_at_utc,
                    ),
                )

                cur.execute(
                    insert_event_sql,
                    (
                        pool_id,
                        None,
                        "organizer",
                        pool_id,
                        "pool_created",
                        json.dumps(
                            {
                                "pool_name": pool_name,
                                "lang": lang,
                                "scoring_mode": scoring_mode,
                                "marketing_opt_in": bool(req.marketing_opt_in),
                                "source": "public_worldcup_pool_create",
                            }
                        ),
                    ),
                )

                cur.execute(
                    insert_event_sql,
                    (
                        pool_id,
                        creator_participant_id,
                        "participant",
                        creator_participant_id,
                        "participant_joined",
                        json.dumps(
                            {
                                "email": organizer_email,
                                "display_name": organizer_name,
                                "joined_existing": False,
                                "is_creator": True,
                                "marketing_opt_in": bool(req.marketing_opt_in),
                                "source": "public_worldcup_pool_create",
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_CREATE_FAILED",
                "message": f"Failed to create pool: {e}",
            },
        )

    if not row or not creator_participant_row:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_CREATE_EMPTY",
                "message": "Pool creation returned empty.",
            },
        )

    pool_id, slug, name, row_lang, row_invite_token, row_scoring_mode = row
    invite_url = _build_invite_url(
        origin=settings.product_public_origin,
        lang=str(row_lang),
        invite_token=str(row_invite_token),
    )

    admin_url = _build_admin_url(
        origin=settings.product_public_origin,
        lang=str(row_lang),
        slug=str(slug),
    )

    session_cookie_max_age_seconds = settings.worldcup_pool_session_ttl_days * 24 * 60 * 60

    if settings.worldcup_pool_organizer_session_cookie_name == settings.worldcup_pool_participant_session_cookie_name:
        _append_worldcup_pool_session_tokens_to_cookie(
            request=request,
            response=response,
            cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
            tokens=[organizer_session_token, participant_session_token],
            max_age_seconds=session_cookie_max_age_seconds,
            path=WORLDCUP_POOL_COOKIE_PATH,
        )
    else:
        _set_worldcup_pool_session_cookie(
            response=response,
            cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
            token=organizer_session_token,
            max_age_seconds=session_cookie_max_age_seconds,
            path=WORLDCUP_POOL_ORGANIZER_COOKIE_PATH,
            request=request,
        )
        _set_worldcup_pool_session_cookie(
            response=response,
            cookie_name=settings.worldcup_pool_participant_session_cookie_name,
            token=participant_session_token,
            max_age_seconds=session_cookie_max_age_seconds,
            path=WORLDCUP_POOL_PARTICIPANT_COOKIE_PATH,
            request=request,
        )

    _send_worldcup_pool_access_email_safely(
        to_email=organizer_email,
        lang=str(row_lang),
        pool_name=str(name),
        invite_url=invite_url,
        admin_url=admin_url,
    )

    return WorldCupPoolCreateResponse(
        ok=True,
        organizer_session_created=True,
        participant_session_created=True,
        creator_participant=WorldCupPoolCreatedParticipant(
            id=int(creator_participant_row[0]),
            display_name=str(creator_participant_row[1]),
            email=str(creator_participant_row[2]),
            status=str(creator_participant_row[3]),
        ),
        pool=WorldCupPoolCreatedPool(
            id=int(pool_id),
            slug=str(slug),
            name=str(name),
            lang=row_lang,
            scoring_mode=_normalize_worldcup_scoring_mode(row_scoring_mode),
            invite_token=str(row_invite_token),
            invite_url=invite_url,
            admin_url=admin_url,
        ),
    )

@router.get("/invites/{invite_token}", response_model=WorldCupPoolInviteResponse)
def get_worldcup_pool_invite(invite_token: str) -> WorldCupPoolInviteResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    token = str(invite_token or "").strip()
    if not token:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "INVITE_NOT_FOUND",
                "message": "Invite not found.",
            },
        )

    sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        COUNT(pt.id) FILTER (WHERE pt.status = 'active') AS participant_count
      FROM worldcup_pool.pools p
      LEFT JOIN worldcup_pool.participants pt
        ON pt.pool_id = p.id
      WHERE p.invite_token = %s
        AND p.status = 'active'
      GROUP BY p.id, p.slug, p.name, p.lang, p.status, p.scoring_mode
      LIMIT 1
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (token,))
                row = cur.fetchone()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "INVITE_LOOKUP_FAILED",
                "message": f"Failed to lookup invite: {e}",
            },
        )

    if not row:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "INVITE_NOT_FOUND",
                "message": "Invite not found.",
            },
        )

    return WorldCupPoolInviteResponse(
        ok=True,
        join_enabled=settings.worldcup_pool_join_enabled,
        pool=_pool_invite_from_row(row),
    )

@router.post("/access/pin-reset", response_model=WorldCupPoolPinResetResponse)
def request_worldcup_pool_pin_reset(
    req: WorldCupPoolPinResetRequest,
) -> WorldCupPoolPinResetResponse:
    settings = load_settings()

    if (
        not settings.worldcup_pool_enabled
        or settings.worldcup_pool_readonly_enabled
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_PIN_RESET_DISABLED",
                "message": "World Cup Pool PIN reset is disabled.",
            },
        )

    email = str(req.email).strip().lower()
    pool_slug = str(req.pool_slug or "").strip()
    invite_token = str(req.invite_token or "").strip()

    if not pool_slug and not invite_token:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "POOL_IDENTIFIER_REQUIRED",
                "message": "pool_slug or invite_token is required.",
            },
        )

    pool_sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.invite_token,
        p.organizer_email
      FROM worldcup_pool.pools p
      WHERE p.status = 'active'
        AND (
          (%s <> '' AND p.slug = %s)
          OR
          (%s <> '' AND p.invite_token = %s)
        )
      LIMIT 1
    """

    participant_sql = """
      SELECT
        id,
        email
      FROM worldcup_pool.participants
      WHERE pool_id = %s
        AND lower(email) = lower(%s)
        AND status = 'active'
      LIMIT 1
    """

    update_pool_pin_sql = """
      UPDATE worldcup_pool.pools
      SET
        organizer_pin_hash = %s,
        updated_at_utc = NOW()
      WHERE id = %s
    """

    update_participant_pin_sql = """
      UPDATE worldcup_pool.participants
      SET pin_hash = %s
      WHERE id = %s
    """

    insert_event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        %s,
        'system',
        NULL,
        'pin_reset_sent',
        %s::jsonb
      )
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(pool_sql, (pool_slug, pool_slug, invite_token, invite_token))
                pool_row = cur.fetchone()

                if not pool_row:
                    return WorldCupPoolPinResetResponse(ok=True)

                pool_id = int(pool_row[0])
                organizer_email = str(pool_row[5]).strip().lower()
                is_organizer = organizer_email == email

                cur.execute(participant_sql, (pool_id, email))
                participant_row = cur.fetchone()

        is_participant = participant_row is not None

        if not is_organizer and not is_participant:
            return WorldCupPoolPinResetResponse(ok=True)

        new_pin = _make_worldcup_pool_pin()
        invite_url = _build_invite_url(
            origin=settings.product_public_origin,
            lang=str(pool_row[3]),
            invite_token=str(pool_row[4]),
        )
        admin_url = _build_admin_url(
            origin=settings.product_public_origin,
            lang=str(pool_row[3]),
            slug=str(pool_row[1]),
        )

        payload = _build_worldcup_pool_pin_reset_email(
            lang=str(pool_row[3]),
            pool_name=str(pool_row[2]),
            new_pin=new_pin,
            invite_url=invite_url if (is_participant or is_organizer) else None,
            admin_url=None,
        )

        try:
            send_product_email(
                to_email=email,
                subject=payload["subject"],
                text_body=payload["text_body"],
                html_body=payload["html_body"],
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail={
                    "ok": False,
                    "code": "PIN_RESET_EMAIL_FAILED",
                    "message": f"Failed to send PIN reset email: {exc}",
                },
            )

        with pg_conn() as conn:
            with conn.cursor() as cur:
                if is_organizer:
                    cur.execute(update_pool_pin_sql, (_hash_pin(new_pin), pool_id))
                    _clear_worldcup_pin_failures(
                        cur,
                        pool_id=pool_id,
                        owner_type="organizer",
                        email=email,
                    )

                participant_id = None
                if participant_row:
                    participant_id = int(participant_row[0])
                    cur.execute(update_participant_pin_sql, (_hash_pin(new_pin), participant_id))
                    _clear_worldcup_pin_failures(
                        cur,
                        pool_id=pool_id,
                        owner_type="participant",
                        email=email,
                    )

                cur.execute(
                    insert_event_sql,
                    (
                        pool_id,
                        participant_id,
                        json.dumps(
                            {
                                "email": email,
                                "roles": {
                                    "organizer": is_organizer,
                                    "participant": is_participant,
                                },
                                "sent_links": {
                                    "invite_url": is_participant,
                                    "admin_url": is_organizer,
                                },
                                "source": "public_worldcup_pool_pin_reset",
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_PIN_RESET_FAILED",
                "message": f"Failed to reset PIN: {e}",
            },
        )

    return WorldCupPoolPinResetResponse(ok=True)


@router.post("/invites/{invite_token}/participants", response_model=WorldCupPoolJoinResponse)
def join_worldcup_pool(
    invite_token: str,
    req: WorldCupPoolJoinRequest,
    request: Request,
    response: Response,
) -> WorldCupPoolJoinResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled or not settings.worldcup_pool_join_enabled:
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_JOIN_DISABLED",
                "message": "World Cup Pool join is disabled.",
            },
        )

    if not req.terms_accepted:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "TERMS_NOT_ACCEPTED",
                "message": "Terms must be accepted to join a pool.",
            },
        )

    _validate_pin(req.pin)

    token = str(invite_token or "").strip()
    display_name = req.display_name.strip()
    email = str(req.email).strip().lower()
    pin = req.pin
    pin_hash = _hash_pin(pin)

    if len(display_name) < 2:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "code": "INVALID_DISPLAY_NAME",
                "message": "Display name is required.",
            },
        )

    session_token = secrets.token_urlsafe(32)
    session_token_hash = _hash_session_token(session_token)
    expires_at_utc = _now_utc() + timedelta(days=settings.worldcup_pool_session_ttl_days)
    user_agent: Optional[str] = request.headers.get("user-agent")

    pool_row = None
    participant_row = None
    joined_existing = False

    pool_sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        COUNT(pt.id) FILTER (WHERE pt.status = 'active') AS participant_count
      FROM worldcup_pool.pools p
      LEFT JOIN worldcup_pool.participants pt
        ON pt.pool_id = p.id
      WHERE p.invite_token = %s
        AND p.status = 'active'
      GROUP BY p.id, p.slug, p.name, p.lang, p.status, p.scoring_mode
      LIMIT 1
    """

    find_participant_sql = """
      SELECT
        id,
        display_name,
        email,
        pin_hash,
        status
      FROM worldcup_pool.participants
      WHERE pool_id = %s
        AND lower(email) = lower(%s)
        AND status = 'active'
      LIMIT 1
    """

    insert_participant_sql = """
      INSERT INTO worldcup_pool.participants (
        pool_id,
        display_name,
        email,
        pin_hash,
        status,
        marketing_opt_in,
        public_rank_opt_in,
        terms_accepted_at_utc,
        joined_at_utc,
        last_seen_at_utc
      )
      VALUES (
        %s,
        %s,
        %s,
        %s,
        'active',
        %s,
        false,
        NOW(),
        NOW(),
        NOW()
      )
      RETURNING id, display_name, email, status
    """

    update_participant_seen_sql = """
      UPDATE worldcup_pool.participants
      SET
        display_name = %s,
        marketing_opt_in = marketing_opt_in OR %s,
        last_seen_at_utc = NOW()
      WHERE id = %s
      RETURNING id, display_name, email, status
    """

    insert_session_sql = """
      INSERT INTO worldcup_pool.sessions (
        pool_id,
        participant_id,
        owner_type,
        session_token_hash,
        user_agent,
        expires_at_utc
      )
      VALUES (
        %s,
        %s,
        'participant',
        %s,
        %s,
        %s
      )
    """

    insert_event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        %s,
        'participant',
        %s,
        %s,
        %s::jsonb
      )
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(pool_sql, (token,))
                pool_row = cur.fetchone()

                if not pool_row:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "ok": False,
                            "code": "INVITE_NOT_FOUND",
                            "message": "Invite not found.",
                        },
                    )

                pool_id = int(pool_row[0])

                cur.execute(find_participant_sql, (pool_id, email))
                existing = cur.fetchone()

                if existing:
                    existing_id = int(existing[0])
                    existing_pin_hash = str(existing[3])

                    _assert_worldcup_pin_attempt_allowed(
                        cur,
                        pool_id=pool_id,
                        owner_type="participant",
                        email=email,
                    )

                    if not _verify_pin(pin, existing_pin_hash):
                        _record_worldcup_pin_attempt(
                            cur,
                            pool_id=pool_id,
                            owner_type="participant",
                            email=email,
                            request=request,
                            success=False,
                            failure_code="invalid_pin",
                        )
                        conn.commit()

                        raise HTTPException(
                            status_code=401,
                            detail={
                                "ok": False,
                                "code": "INVALID_PIN",
                                "message": "Invalid PIN for this email.",
                            },
                        )

                    _clear_worldcup_pin_failures(
                        cur,
                        pool_id=pool_id,
                        owner_type="participant",
                        email=email,
                    )
                    _record_worldcup_pin_attempt(
                        cur,
                        pool_id=pool_id,
                        owner_type="participant",
                        email=email,
                        request=request,
                        success=True,
                    )

                    joined_existing = True

                    cur.execute(
                        update_participant_seen_sql,
                        (
                            display_name,
                            bool(req.marketing_opt_in),
                            existing_id,
                        ),
                    )
                    participant_row = cur.fetchone()
                else:
                    cur.execute(
                        insert_participant_sql,
                        (
                            pool_id,
                            display_name,
                            email,
                            pin_hash,
                            bool(req.marketing_opt_in),
                        ),
                    )
                    participant_row = cur.fetchone()

                if not participant_row:
                    raise RuntimeError("participant_insert_or_update_returned_empty")

                participant_id = int(participant_row[0])

                cur.execute(
                    insert_session_sql,
                    (
                        pool_id,
                        participant_id,
                        session_token_hash,
                        user_agent[:500] if user_agent else None,
                        expires_at_utc,
                    ),
                )

                cur.execute(
                    insert_event_sql,
                    (
                        pool_id,
                        participant_id,
                        participant_id,
                        "participant_logged_in" if joined_existing else "participant_joined",
                        json.dumps(
                            {
                                "email": email,
                                "display_name": display_name,
                                "joined_existing": joined_existing,
                                "marketing_opt_in": bool(req.marketing_opt_in),
                                "source": "public_worldcup_pool_invite",
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_JOIN_FAILED",
                "message": f"Failed to join pool: {e}",
            },
        )

    if not pool_row or not participant_row:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_JOIN_EMPTY",
                "message": "Join returned empty.",
            },
        )

    _set_worldcup_pool_session_cookie(
        response=response,
        cookie_name=settings.worldcup_pool_participant_session_cookie_name,
        token=session_token,
        max_age_seconds=settings.worldcup_pool_session_ttl_days * 24 * 60 * 60,
        path=WORLDCUP_POOL_PARTICIPANT_COOKIE_PATH,
        request=request,
    )

    # Atualiza participant_count em +1 apenas quando novo participante entrou.
    pool = _pool_invite_from_row(pool_row)
    if not joined_existing:
        pool.participant_count += 1

        _send_worldcup_pool_access_email_safely(
            to_email=str(participant_row[2]),
            lang=str(pool.lang),
            pool_name=str(pool.name),
            invite_url=_build_invite_url(
                origin=settings.product_public_origin,
                lang=str(pool.lang),
                invite_token=token,
            ),
            admin_url=None,
        )

    return WorldCupPoolJoinResponse(
        ok=True,
        pool=pool,
        participant=WorldCupPoolJoinedParticipant(
            id=int(participant_row[0]),
            display_name=str(participant_row[1]),
            email=str(participant_row[2]),
            status=str(participant_row[3]),
            joined_existing=joined_existing,
        ),
        participant_session_created=True,
    )

@router.post(
    "/invites/{invite_token}/participant-login",
    response_model=WorldCupPoolJoinResponse,
)
def login_worldcup_pool_participant(
    invite_token: str,
    req: WorldCupPoolParticipantLoginRequest,
    request: Request,
    response: Response,
) -> WorldCupPoolJoinResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled or not settings.worldcup_pool_join_enabled:
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_JOIN_DISABLED",
                "message": "World Cup Pool join is disabled.",
            },
        )

    _validate_pin(req.pin)

    token = str(invite_token or "").strip()
    email = str(req.email).strip().lower()
    session_token = secrets.token_urlsafe(32)
    session_token_hash = _hash_session_token(session_token)
    expires_at_utc = _now_utc() + timedelta(days=settings.worldcup_pool_session_ttl_days)
    user_agent: Optional[str] = request.headers.get("user-agent")

    pool_row = None
    participant_row = None

    pool_sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        COUNT(pt.id) FILTER (WHERE pt.status = 'active') AS participant_count
      FROM worldcup_pool.pools p
      LEFT JOIN worldcup_pool.participants pt
        ON pt.pool_id = p.id
      WHERE p.invite_token = %s
        AND p.status = 'active'
      GROUP BY p.id, p.slug, p.name, p.lang, p.status, p.scoring_mode
      LIMIT 1
    """

    find_participant_sql = """
      SELECT
        id,
        display_name,
        email,
        pin_hash,
        status
      FROM worldcup_pool.participants
      WHERE pool_id = %s
        AND lower(email) = lower(%s)
        AND status = 'active'
      LIMIT 1
    """

    update_participant_seen_sql = """
      UPDATE worldcup_pool.participants
      SET last_seen_at_utc = NOW()
      WHERE id = %s
      RETURNING id, display_name, email, status
    """

    insert_session_sql = """
      INSERT INTO worldcup_pool.sessions (
        pool_id,
        participant_id,
        owner_type,
        session_token_hash,
        user_agent,
        expires_at_utc
      )
      VALUES (
        %s,
        %s,
        'participant',
        %s,
        %s,
        %s
      )
    """

    insert_event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        %s,
        'participant',
        %s,
        'participant_logged_in',
        %s::jsonb
      )
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(pool_sql, (token,))
                pool_row = cur.fetchone()

                if not pool_row:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "ok": False,
                            "code": "INVITE_NOT_FOUND",
                            "message": "Invite not found.",
                        },
                    )

                pool_id = int(pool_row[0])

                cur.execute(find_participant_sql, (pool_id, email))
                existing = cur.fetchone()

                if not existing:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "ok": False,
                            "code": "PARTICIPANT_NOT_FOUND",
                            "message": "Participant not found for this pool.",
                        },
                    )

                existing_pin_hash = str(existing[3])

                _assert_worldcup_pin_attempt_allowed(
                    cur,
                    pool_id=pool_id,
                    owner_type="participant",
                    email=email,
                )

                if not _verify_pin(req.pin, existing_pin_hash):
                    _record_worldcup_pin_attempt(
                        cur,
                        pool_id=pool_id,
                        owner_type="participant",
                        email=email,
                        request=request,
                        success=False,
                        failure_code="invalid_pin",
                    )
                    conn.commit()

                    raise HTTPException(
                        status_code=401,
                        detail={
                            "ok": False,
                            "code": "INVALID_PIN",
                            "message": "Invalid PIN for this email.",
                        },
                    )

                _clear_worldcup_pin_failures(
                    cur,
                    pool_id=pool_id,
                    owner_type="participant",
                    email=email,
                )
                _record_worldcup_pin_attempt(
                    cur,
                    pool_id=pool_id,
                    owner_type="participant",
                    email=email,
                    request=request,
                    success=True,
                )

                participant_id = int(existing[0])

                cur.execute(update_participant_seen_sql, (participant_id,))
                participant_row = cur.fetchone()

                if not participant_row:
                    raise RuntimeError("participant_login_update_returned_empty")

                cur.execute(
                    insert_session_sql,
                    (
                        pool_id,
                        participant_id,
                        session_token_hash,
                        user_agent[:500] if user_agent else None,
                        expires_at_utc,
                    ),
                )

                cur.execute(
                    insert_event_sql,
                    (
                        pool_id,
                        participant_id,
                        participant_id,
                        json.dumps(
                            {
                                "email": email,
                                "source": "public_worldcup_pool_invite_login",
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_PARTICIPANT_LOGIN_FAILED",
                "message": f"Failed to login participant: {e}",
            },
        )

    if not pool_row or not participant_row:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_PARTICIPANT_LOGIN_EMPTY",
                "message": "Participant login returned empty.",
            },
        )

    _set_worldcup_pool_session_cookie(
        response=response,
        cookie_name=settings.worldcup_pool_participant_session_cookie_name,
        token=session_token,
        max_age_seconds=settings.worldcup_pool_session_ttl_days * 24 * 60 * 60,
        path=WORLDCUP_POOL_PARTICIPANT_COOKIE_PATH,
        request=request,
    )

    return WorldCupPoolJoinResponse(
        ok=True,
        pool=_pool_invite_from_row(pool_row),
        participant=WorldCupPoolJoinedParticipant(
            id=int(participant_row[0]),
            display_name=str(participant_row[1]),
            email=str(participant_row[2]),
            status=str(participant_row[3]),
            joined_existing=True,
        ),
        participant_session_created=True,
    )

@router.post(
    "/invites/{invite_token}/participant/logout",
    response_model=WorldCupPoolLogoutResponse,
)
def logout_worldcup_pool_participant(
    invite_token: str,
    request: Request,
    response: Response,
) -> WorldCupPoolLogoutResponse:
    settings = load_settings()

    session_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=settings.worldcup_pool_participant_session_cookie_name,
    )

    if session_tokens:
        session_token_hashes = [_hash_session_token(session_token) for session_token in session_tokens]
        token = str(invite_token or "").strip()

        try:
            with pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                          UPDATE worldcup_pool.sessions s
                          SET
                            revoked_at_utc = COALESCE(s.revoked_at_utc, NOW()),
                            last_seen_at_utc = NOW()
                          FROM worldcup_pool.pools p
                          WHERE s.pool_id = p.id
                            AND s.session_token_hash = ANY(%s)
                            AND s.owner_type = 'participant'
                            AND p.invite_token = %s
                          RETURNING s.session_token_hash
                        """,
                        (session_token_hashes, token),
                    )
                    revoked_hashes = {str(row[0]) for row in cur.fetchall()}
                conn.commit()

            _remove_worldcup_pool_session_tokens_from_cookie(
                request=request,
                response=response,
                cookie_name=settings.worldcup_pool_participant_session_cookie_name,
                revoked_token_hashes=revoked_hashes,
                max_age_seconds=settings.worldcup_pool_session_ttl_days * 24 * 60 * 60,
                path=WORLDCUP_POOL_PARTICIPANT_COOKIE_PATH,
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail={
                    "ok": False,
                    "code": "PARTICIPANT_LOGOUT_FAILED",
                    "message": f"Failed to logout participant: {e}",
                },
            )

    return WorldCupPoolLogoutResponse(ok=True)

@router.get(
    "/invites/{invite_token}/participant/me",
    response_model=WorldCupPoolParticipantDashboardResponse,
)
def get_worldcup_pool_participant_dashboard(
    invite_token: str,
    request: Request,
) -> WorldCupPoolParticipantDashboardResponse:
    pool, participant = _require_participant_context(invite_token, request)

    return WorldCupPoolParticipantDashboardResponse(
        ok=True,
        pool=pool,
        participant=participant,
        scoring=_worldcup_scoring_config_for_phase(pool.scoring_mode, "group"),
        scoring_mode=pool.scoring_mode,
        scoring_rules=_worldcup_scoring_rules(pool.scoring_mode),
    )

@router.get(
    "/invites/{invite_token}/participant/matches",
    response_model=WorldCupPoolParticipantMatchesResponse,
)
def list_worldcup_pool_participant_matches(
    invite_token: str,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=10),
    match_filter: WorldCupPoolMatchFilter = Query("all", alias="filter"),
    round_filter: WorldCupPoolMatchRoundFilter = Query("all", alias="round"),
) -> WorldCupPoolParticipantMatchesResponse:
    pool, participant = _require_participant_context(invite_token, request)

    current_lang = str(pool.lang or "pt")
    offset = (page - 1) * page_size

    lock_expr = """
      (
        m.status = 'finished'
        OR (
          COALESCE(m.lock_at_utc, m.kickoff_utc) IS NOT NULL
          AND COALESCE(m.lock_at_utc, m.kickoff_utc) <= NOW()
        )
      )
    """

    filter_sql = ""
    if match_filter == "pending":
        filter_sql = f"AND pr.id IS NULL AND NOT {lock_expr}"
    elif match_filter == "predicted":
        filter_sql = "AND pr.id IS NOT NULL"
    elif match_filter == "locked":
        filter_sql = f"AND {lock_expr}"

    round_sql = ""
    if round_filter == "1":
        round_sql = "AND m.phase = 'group' AND m.match_key ~ '_match_[12]$'"
    elif round_filter == "2":
        round_sql = "AND m.phase = 'group' AND m.match_key ~ '_match_[34]$'"
    elif round_filter == "3":
        round_sql = "AND m.phase = 'group' AND m.match_key ~ '_match_[56]$'"

    summary_sql = f"""
      SELECT
        COUNT(m.id) AS total_matches,
        COUNT(pr.id) AS predicted_matches,
        COUNT(m.id) FILTER (
          WHERE pr.id IS NULL
            AND NOT {lock_expr}
        ) AS pending_matches,
        COUNT(m.id) FILTER (
          WHERE {lock_expr}
        ) AS locked_matches
       FROM worldcup_pool.matches m
       LEFT JOIN worldcup_pool.predictions pr
        ON pr.match_id = m.id
       AND pr.pool_id = %s
       AND pr.participant_id = %s
      WHERE m.competition_key = 'fifa_world_cup_2026'
        AND m.status <> 'cancelled'
    """

    count_sql = f"""
      SELECT COUNT(m.id)
      FROM worldcup_pool.matches m
      LEFT JOIN worldcup_pool.predictions pr
        ON pr.match_id = m.id
       AND pr.pool_id = %s
       AND pr.participant_id = %s
      WHERE m.competition_key = 'fifa_world_cup_2026'
        AND m.status <> 'cancelled'
        {filter_sql}
        {round_sql}
    """

    items_sql = f"""
      SELECT
        m.id,
        m.match_key,
        m.official_match_no,
        m.display_order,
        m.phase,
        m.group_code,
        m.bracket_label,
        COALESCE(
          m.home_team_i18n ->> %s,
          m.home_label_i18n ->> %s,
          m.home_label_i18n ->> 'pt',
          m.match_key
        ) AS home_label,
        COALESCE(
          m.away_team_i18n ->> %s,
          m.away_label_i18n ->> %s,
          m.away_label_i18n ->> 'pt',
          m.match_key
        ) AS away_label,
        m.kickoff_utc,
        COALESCE(m.lock_at_utc, m.kickoff_utc) AS lock_at_utc,
        m.status,
        {lock_expr} AS is_locked,
        pr.predicted_home_score,
        pr.predicted_away_score,
        pr.updated_at_utc,
        pr.locked_at_utc
      FROM worldcup_pool.matches m
      LEFT JOIN worldcup_pool.predictions pr
        ON pr.match_id = m.id
       AND pr.pool_id = %s
       AND pr.participant_id = %s
      WHERE m.competition_key = 'fifa_world_cup_2026'
        AND m.status <> 'cancelled'
        {filter_sql}
        {round_sql}
      ORDER BY
        m.display_order ASC,
        m.kickoff_utc NULLS LAST,
        m.id ASC
      LIMIT %s
      OFFSET %s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(summary_sql, (pool.id, participant.id))
                summary_row = cur.fetchone()

                cur.execute(count_sql, (pool.id, participant.id))
                total_items = int((cur.fetchone() or [0])[0] or 0)

                cur.execute(
                    items_sql,
                    (
                        current_lang,
                        current_lang,
                        current_lang,
                        current_lang,
                        pool.id,
                        participant.id,
                        page_size,
                        offset,
                    ),
                )
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "PARTICIPANT_MATCHES_LOOKUP_FAILED",
                "message": f"Failed to load participant matches: {e}",
            },
        )

    total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0

    items: list[WorldCupPoolParticipantMatch] = []
    for row in rows:
        prediction = None
        if row[13] is not None and row[14] is not None:
            prediction = WorldCupPoolMatchPrediction(
                match_id=int(row[0]),
                home_score=int(row[13]),
                away_score=int(row[14]),
                updated_at_utc=_iso(row[15]),
                locked_at_utc=_iso(row[16]),
            )

        items.append(
            WorldCupPoolParticipantMatch(
                id=int(row[0]),
                match_key=str(row[1]),
                official_match_no=int(row[2]) if row[2] is not None else None,
                display_order=int(row[3] or 0),
                phase=str(row[4]),
                group_code=str(row[5]) if row[5] is not None else None,
                bracket_label=str(row[6]) if row[6] is not None else None,
                home_label=str(row[7]),
                away_label=str(row[8]),
                kickoff_utc=_iso(row[9]),
                lock_at_utc=_iso(row[10]),
                status=str(row[11]),
                is_locked=bool(row[12]),
                prediction=prediction,
            )
        )

    return WorldCupPoolParticipantMatchesResponse(
        ok=True,
        pool=pool,
        participant=participant,
        items=items,
        summary=WorldCupPoolPredictionSummary(
            total_matches=int(summary_row[0] or 0) if summary_row else 0,
            predicted_matches=int(summary_row[1] or 0) if summary_row else 0,
            pending_matches=int(summary_row[2] or 0) if summary_row else 0,
            locked_matches=int(summary_row[3] or 0) if summary_row else 0,
        ),
        pagination=WorldCupPoolPagination(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        ),
    )

@router.put(
    "/invites/{invite_token}/participant/predictions/{match_id}",
    response_model=WorldCupPoolPredictionUpsertResponse,
)
def upsert_worldcup_pool_prediction(
    invite_token: str,
    match_id: int,
    req: WorldCupPoolPredictionUpsertRequest,
    request: Request,
) -> WorldCupPoolPredictionUpsertResponse:
    settings = load_settings()

    if (
        not settings.worldcup_pool_enabled
        or not settings.worldcup_pool_predictions_enabled
        or settings.worldcup_pool_readonly_enabled
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_PREDICTIONS_DISABLED",
                "message": "World Cup Pool predictions are disabled.",
            },
        )

    pool, participant = _require_participant_context(invite_token, request)

    match_sql = """
      SELECT
        m.id,
        m.match_key,
        COALESCE(m.lock_at_utc, m.kickoff_utc) AS lock_at_utc,
        (
          m.status = 'finished'
          OR (
            COALESCE(m.lock_at_utc, m.kickoff_utc) IS NOT NULL
            AND COALESCE(m.lock_at_utc, m.kickoff_utc) <= NOW()
          )
        ) AS is_locked,
        m.status
      FROM worldcup_pool.matches m
      WHERE m.id = %s
        AND m.competition_key = 'fifa_world_cup_2026'
        AND m.status <> 'cancelled'
      LIMIT 1
    """

    upsert_sql = """
      INSERT INTO worldcup_pool.predictions (
        pool_id,
        participant_id,
        match_id,
        predicted_home_score,
        predicted_away_score,
        updated_at_utc
      )
      VALUES (
        %s,
        %s,
        %s,
        %s,
        %s,
        NOW()
      )
      ON CONFLICT (pool_id, participant_id, match_id)
      DO UPDATE SET
        predicted_home_score = EXCLUDED.predicted_home_score,
        predicted_away_score = EXCLUDED.predicted_away_score,
        updated_at_utc = NOW()
      WHERE worldcup_pool.predictions.locked_at_utc IS NULL
      RETURNING
        id,
        match_id,
        predicted_home_score,
        predicted_away_score,
        points,
        updated_at_utc,
        locked_at_utc
    """

    event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        %s,
        'participant',
        %s,
        'prediction_saved',
        %s::jsonb
      )
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(match_sql, (match_id,))
                match_row = cur.fetchone()

                if not match_row:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "ok": False,
                            "code": "MATCH_NOT_FOUND",
                            "message": "Match not found.",
                        },
                    )

                if bool(match_row[3]):
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "ok": False,
                            "code": "MATCH_LOCKED",
                            "message": "This match is already locked for predictions.",
                        },
                    )

                cur.execute(
                    upsert_sql,
                    (
                        pool.id,
                        participant.id,
                        int(match_row[0]),
                        req.home_score,
                        req.away_score,
                    ),
                )
                prediction_row = cur.fetchone()

                if not prediction_row:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "ok": False,
                            "code": "PREDICTION_LOCKED",
                            "message": "This prediction is locked and can no longer be edited.",
                        },
                    )

                cur.execute(
                    event_sql,
                    (
                        pool.id,
                        participant.id,
                        participant.id,
                        json.dumps(
                            {
                                "match_id": int(match_row[0]),
                                "match_key": str(match_row[1]),
                                "home_score": req.home_score,
                                "away_score": req.away_score,
                                "source": "participant_autosave",
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "PREDICTION_SAVE_FAILED",
                "message": f"Failed to save prediction: {e}",
            },
        )

    return WorldCupPoolPredictionUpsertResponse(
        ok=True,
        prediction=WorldCupPoolSavedPrediction(
            id=int(prediction_row[0]),
            match_id=int(prediction_row[1]),
            home_score=int(prediction_row[2]),
            away_score=int(prediction_row[3]),
            points=int(prediction_row[4] or 0),
            updated_at_utc=_iso(prediction_row[5]),
            locked_at_utc=_iso(prediction_row[6]),
        ),
    )

@router.get(
    "/invites/{invite_token}/participant/ranking",
    response_model=WorldCupPoolRankingResponse,
)
def get_worldcup_pool_participant_ranking(
    invite_token: str,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=10),
) -> WorldCupPoolRankingResponse:
    pool, participant = _require_participant_context(invite_token, request)

    offset = (page - 1) * page_size

    count_sql = """
      SELECT COUNT(*)
      FROM worldcup_pool.participants
      WHERE pool_id = %s
        AND status = 'active'
    """

    ranking_cte = """
      WITH ranked AS (
        SELECT
          pt.id AS participant_id,
          pt.display_name,
          COALESCE(SUM(pr.points), 0)::int AS points,
          COUNT(DISTINCT pr.id)::int AS predictions_count,
          MAX(pr.updated_at_utc) AS last_prediction_at_utc,
          ROW_NUMBER() OVER (
            ORDER BY
              COALESCE(SUM(pr.points), 0) DESC,
              COUNT(pr.id) DESC,
              pt.joined_at_utc ASC,
              pt.id ASC
          )::int AS rank_position
        FROM worldcup_pool.participants pt
        LEFT JOIN worldcup_pool.predictions pr
          ON pr.pool_id = pt.pool_id
         AND pr.participant_id = pt.id
        WHERE pt.pool_id = %s
          AND pt.status = 'active'
        GROUP BY
          pt.id,
          pt.display_name,
          pt.joined_at_utc
      )
    """

    items_sql = ranking_cte + """
      SELECT
        rank_position,
        participant_id,
        display_name,
        points,
        predictions_count,
        last_prediction_at_utc,
        participant_id = %s AS is_me
      FROM ranked
      ORDER BY rank_position ASC
      LIMIT %s
      OFFSET %s
    """

    me_sql = ranking_cte + """
      SELECT
        rank_position,
        participant_id,
        display_name,
        points,
        predictions_count,
        last_prediction_at_utc,
        true AS is_me
      FROM ranked
      WHERE participant_id = %s
      LIMIT 1
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(count_sql, (pool.id,))
                total_items = int((cur.fetchone() or [0])[0] or 0)

                cur.execute(
                    items_sql,
                    (
                        pool.id,
                        participant.id,
                        page_size,
                        offset,
                    ),
                )
                item_rows = cur.fetchall()

                cur.execute(
                    me_sql,
                    (
                        pool.id,
                        participant.id,
                    ),
                )
                me_row = cur.fetchone()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "PARTICIPANT_RANKING_LOOKUP_FAILED",
                "message": f"Failed to load participant ranking: {e}",
            },
        )

    if not me_row:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "PARTICIPANT_RANKING_NOT_FOUND",
                "message": "Participant ranking position not found.",
            },
        )

    def _ranking_item_from_row(row) -> WorldCupPoolRankingItem:
        return WorldCupPoolRankingItem(
            rank=int(row[0]),
            participant_id=int(row[1]),
            display_name=str(row[2]),
            points=int(row[3] or 0),
            predictions_count=int(row[4] or 0),
            last_prediction_at_utc=_iso(row[5]),
            is_me=bool(row[6]),
        )

    total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0

    return WorldCupPoolRankingResponse(
        ok=True,
        pool=pool,
        participant=participant,
        me=_ranking_item_from_row(me_row),
        items=[_ranking_item_from_row(row) for row in item_rows],
        pagination=WorldCupPoolPagination(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        ),
    )

def _require_organizer_pool(slug: str, request: Request) -> WorldCupPoolOrganizerPool:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    session_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
    )
    if not session_tokens:
        raise HTTPException(
            status_code=401,
            detail={
                "ok": False,
                "code": "ORGANIZER_SESSION_REQUIRED",
                "message": "Organizer session is required.",
            },
        )

    session_token_hashes = [_hash_session_token(session_token) for session_token in session_tokens]

    sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        COUNT(pt.id) FILTER (WHERE pt.status = 'active') AS participant_count,
        s.session_token_hash
      FROM worldcup_pool.sessions s
      JOIN worldcup_pool.pools p
        ON p.id = s.pool_id
      LEFT JOIN worldcup_pool.participants session_pt
        ON session_pt.id = s.participant_id
       AND session_pt.pool_id = p.id
      LEFT JOIN worldcup_pool.participants pt
        ON pt.pool_id = p.id
      WHERE s.session_token_hash = ANY(%s)
        AND s.revoked_at_utc IS NULL
        AND s.expires_at_utc > NOW()
        AND p.slug = %s
        AND p.status = 'active'
        AND (
          s.owner_type = 'organizer'
          OR (
            s.owner_type = 'participant'
            AND session_pt.status = 'active'
            AND lower(session_pt.email) = lower(p.organizer_email)
          )
        )
        AND (
          s.owner_type = 'organizer'
          OR (
            s.owner_type = 'participant'
            AND session_pt.status = 'active'
            AND lower(session_pt.email) = lower(p.organizer_email)
          )
        )
      GROUP BY p.id, p.slug, p.name, p.lang, p.status, p.scoring_mode, p.invite_token, s.session_token_hash
      LIMIT 1
    """

    update_seen_sql = """
      UPDATE worldcup_pool.sessions
      SET last_seen_at_utc = NOW()
      WHERE session_token_hash = %s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (session_token_hashes, slug))
                row = cur.fetchone()

                if not row:
                    raise HTTPException(
                        status_code=401,
                        detail={
                            "ok": False,
                            "code": "INVALID_ORGANIZER_SESSION",
                            "message": "Invalid organizer session.",
                        },
                    )

                cur.execute(update_seen_sql, (str(row[8]),))
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "ORGANIZER_SESSION_LOOKUP_FAILED",
                "message": f"Failed to validate organizer session: {e}",
            },
        )

    invite_url = _build_invite_url(
        origin=settings.product_public_origin,
        lang=str(row[3]),
        invite_token=str(row[6]),
    )
    admin_url = _build_admin_url(
        origin=settings.product_public_origin,
        lang=str(row[3]),
        slug=str(row[1]),
    )

    return WorldCupPoolOrganizerPool(
        id=int(row[0]),
        slug=str(row[1]),
        name=str(row[2]),
        lang=row[3],
        scoring_mode=_normalize_worldcup_scoring_mode(row[5]),
        status=str(row[4]),
        invite_token=str(row[6]),
        invite_url=invite_url,
        admin_url=admin_url,
        participant_count=int(row[7] or 0),
    )

@router.get(
    "/pools/{slug}/organizer/session",
    response_model=WorldCupPoolOrganizerSessionStatusResponse,
)
def get_worldcup_pool_organizer_session_status(
    slug: str,
    request: Request,
) -> WorldCupPoolOrganizerSessionStatusResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    session_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
    )
    if not session_tokens:
        return WorldCupPoolOrganizerSessionStatusResponse(
            ok=True,
            authenticated=False,
            pool=None,
        )

    session_token_hashes = [_hash_session_token(session_token) for session_token in session_tokens]

    sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        COUNT(pt.id) FILTER (WHERE pt.status = 'active') AS participant_count,
        s.session_token_hash
      FROM worldcup_pool.sessions s
      JOIN worldcup_pool.pools p
        ON p.id = s.pool_id
      LEFT JOIN worldcup_pool.participants session_pt
        ON session_pt.id = s.participant_id
       AND session_pt.pool_id = p.id
      LEFT JOIN worldcup_pool.participants pt
        ON pt.pool_id = p.id
      WHERE s.session_token_hash = ANY(%s)
        AND s.revoked_at_utc IS NULL
        AND s.expires_at_utc > NOW()
        AND p.slug = %s
        AND p.status = 'active'
        AND (
          s.owner_type = 'organizer'
          OR (
            s.owner_type = 'participant'
            AND session_pt.status = 'active'
            AND lower(session_pt.email) = lower(p.organizer_email)
          )
        )
      GROUP BY p.id, p.slug, p.name, p.lang, p.status, p.scoring_mode, p.invite_token, s.session_token_hash
      LIMIT 1
    """

    update_seen_sql = """
      UPDATE worldcup_pool.sessions
      SET last_seen_at_utc = NOW()
      WHERE session_token_hash = %s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (session_token_hashes, str(slug or "").strip()))
                row = cur.fetchone()

                if not row:
                    return WorldCupPoolOrganizerSessionStatusResponse(
                        ok=True,
                        authenticated=False,
                        pool=None,
                    )

                cur.execute(update_seen_sql, (str(row[8]),))
            conn.commit()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "ORGANIZER_SESSION_STATUS_FAILED",
                "message": f"Failed to validate organizer session status: {e}",
            },
        )

    invite_url = _build_invite_url(
        origin=settings.product_public_origin,
        lang=str(row[3]),
        invite_token=str(row[6]),
    )
    admin_url = _build_admin_url(
        origin=settings.product_public_origin,
        lang=str(row[3]),
        slug=str(row[1]),
    )

    return WorldCupPoolOrganizerSessionStatusResponse(
        ok=True,
        authenticated=True,
        pool=WorldCupPoolOrganizerPool(
            id=int(row[0]),
            slug=str(row[1]),
            name=str(row[2]),
            lang=row[3],
            scoring_mode=_normalize_worldcup_scoring_mode(row[5]),
            status=str(row[4]),
            invite_token=str(row[6]),
            invite_url=invite_url,
            admin_url=admin_url,
            participant_count=int(row[7] or 0),
        ),
    )

@router.post(
    "/pools/{slug}/organizer-login",
    response_model=WorldCupPoolOrganizerLoginResponse,
)
def login_worldcup_pool_organizer(
    slug: str,
    req: WorldCupPoolOrganizerLoginRequest,
    request: Request,
    response: Response,
) -> WorldCupPoolOrganizerLoginResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    _validate_pin(req.pin)

    clean_slug = str(slug or "").strip()
    email = str(req.email).strip().lower()
    session_token = secrets.token_urlsafe(32)
    session_token_hash = _hash_session_token(session_token)
    expires_at_utc = _now_utc() + timedelta(days=settings.worldcup_pool_session_ttl_days)
    user_agent: Optional[str] = request.headers.get("user-agent")

    pool_sql = """
      SELECT
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        p.organizer_email,
        p.organizer_pin_hash,
        COUNT(pt.id) FILTER (WHERE pt.status = 'active') AS participant_count
      FROM worldcup_pool.pools p
      LEFT JOIN worldcup_pool.participants pt
        ON pt.pool_id = p.id
      WHERE p.slug = %s
        AND p.status = 'active'
      GROUP BY
        p.id,
        p.slug,
        p.name,
        p.lang,
        p.status,
        p.scoring_mode,
        p.invite_token,
        p.organizer_email,
        p.organizer_pin_hash
      LIMIT 1
    """

    insert_session_sql = """
      INSERT INTO worldcup_pool.sessions (
        pool_id,
        participant_id,
        owner_type,
        session_token_hash,
        user_agent,
        expires_at_utc
      )
      VALUES (
        %s,
        NULL,
        'organizer',
        %s,
        %s,
        %s
      )
    """

    insert_event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        NULL,
        'organizer',
        %s,
        'organizer_logged_in',
        %s::jsonb
      )
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(pool_sql, (clean_slug,))
                row = cur.fetchone()

                if not row:
                    raise HTTPException(
                        status_code=401,
                        detail={
                            "ok": False,
                            "code": "INVALID_ORGANIZER_LOGIN",
                            "message": "Invalid organizer email or PIN.",
                        },
                    )

                organizer_email = str(row[7]).strip().lower()
                organizer_pin_hash = str(row[8])
                pool_id = int(row[0])

                _assert_worldcup_pin_attempt_allowed(
                    cur,
                    pool_id=pool_id,
                    owner_type="organizer",
                    email=email,
                )

                if organizer_email != email or not _verify_pin(req.pin, organizer_pin_hash):
                    _record_worldcup_pin_attempt(
                        cur,
                        pool_id=pool_id,
                        owner_type="organizer",
                        email=email,
                        request=request,
                        success=False,
                        failure_code="invalid_organizer_login",
                    )
                    conn.commit()

                    raise HTTPException(
                        status_code=401,
                        detail={
                            "ok": False,
                            "code": "INVALID_ORGANIZER_LOGIN",
                            "message": "Invalid organizer email or PIN.",
                        },
                    )

                _clear_worldcup_pin_failures(
                    cur,
                    pool_id=pool_id,
                    owner_type="organizer",
                    email=email,
                )
                _record_worldcup_pin_attempt(
                    cur,
                    pool_id=pool_id,
                    owner_type="organizer",
                    email=email,
                    request=request,
                    success=True,
                )

                cur.execute(
                    insert_session_sql,
                    (
                        pool_id,
                        session_token_hash,
                        user_agent[:500] if user_agent else None,
                        expires_at_utc,
                    ),
                )

                cur.execute(
                    insert_event_sql,
                    (
                        pool_id,
                        pool_id,
                        json.dumps(
                            {
                                "email": email,
                                "source": "public_worldcup_pool_organizer_login",
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_ORGANIZER_LOGIN_FAILED",
                "message": f"Failed to login organizer: {e}",
            },
        )

    invite_url = _build_invite_url(
        origin=settings.product_public_origin,
        lang=str(row[3]),
        invite_token=str(row[6]),
    )
    admin_url = _build_admin_url(
        origin=settings.product_public_origin,
        lang=str(row[3]),
        slug=str(row[1]),
    )

    _set_worldcup_pool_session_cookie(
        response=response,
        cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
        token=session_token,
        max_age_seconds=settings.worldcup_pool_session_ttl_days * 24 * 60 * 60,
        path=WORLDCUP_POOL_ORGANIZER_COOKIE_PATH,
        request=request,
    )

    return WorldCupPoolOrganizerLoginResponse(
        ok=True,
        organizer_session_created=True,
        pool=WorldCupPoolOrganizerPool(
            id=int(row[0]),
            slug=str(row[1]),
            name=str(row[2]),
            lang=row[3],
            scoring_mode=_normalize_worldcup_scoring_mode(row[5]),
            status=str(row[4]),
            invite_token=str(row[6]),
            invite_url=invite_url,
            admin_url=admin_url,
            participant_count=int(row[9] or 0),
        ),
    )

@router.post(
    "/pools/{slug}/organizer/logout",
    response_model=WorldCupPoolLogoutResponse,
)
def logout_worldcup_pool_organizer(
    slug: str,
    request: Request,
    response: Response,
) -> WorldCupPoolLogoutResponse:
    settings = load_settings()

    session_tokens = _get_worldcup_pool_session_token_candidates(
        request=request,
        cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
    )

    if session_tokens:
        session_token_hashes = [_hash_session_token(session_token) for session_token in session_tokens]
        clean_slug = str(slug or "").strip()

        try:
            with pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                          UPDATE worldcup_pool.sessions s
                          SET
                            revoked_at_utc = COALESCE(s.revoked_at_utc, NOW()),
                            last_seen_at_utc = NOW()
                          FROM worldcup_pool.pools p
                          WHERE s.pool_id = p.id
                            AND s.session_token_hash = ANY(%s)
                            AND s.owner_type = 'organizer'
                            AND p.slug = %s
                          RETURNING s.session_token_hash
                        """,
                        (session_token_hashes, clean_slug),
                    )
                    revoked_hashes = {str(row[0]) for row in cur.fetchall()}
                conn.commit()
            _remove_worldcup_pool_session_tokens_from_cookie(
                request=request,
                response=response,
                cookie_name=settings.worldcup_pool_organizer_session_cookie_name,
                revoked_token_hashes=revoked_hashes,
                max_age_seconds=settings.worldcup_pool_session_ttl_days * 24 * 60 * 60,
                path=WORLDCUP_POOL_ORGANIZER_COOKIE_PATH,
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail={
                    "ok": False,
                    "code": "ORGANIZER_LOGOUT_FAILED",
                    "message": f"Failed to logout organizer: {e}",
                },
            )

    return WorldCupPoolLogoutResponse(ok=True)

@router.post(
    "/pools/{slug}/organizer/participant-session",
    response_model=WorldCupPoolOrganizerParticipantSessionResponse,
)
def create_worldcup_pool_organizer_participant_session(
    slug: str,
    request: Request,
    response: Response,
) -> WorldCupPoolOrganizerParticipantSessionResponse:
    settings = load_settings()

    if not settings.worldcup_pool_enabled:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "code": "WORLDCUP_POOL_DISABLED",
                "message": "World Cup Pool is disabled.",
            },
        )

    pool = _require_organizer_pool(slug, request)

    session_token = secrets.token_urlsafe(32)
    session_token_hash = _hash_session_token(session_token)
    expires_at_utc = _now_utc() + timedelta(days=settings.worldcup_pool_session_ttl_days)
    user_agent: Optional[str] = request.headers.get("user-agent")

    participant_sql = """
      SELECT
        pt.id,
        pt.display_name,
        pt.email,
        pt.status,
        pt.joined_at_utc,
        pt.last_seen_at_utc
      FROM worldcup_pool.pools p
      JOIN worldcup_pool.participants pt
        ON pt.pool_id = p.id
       AND lower(pt.email) = lower(p.organizer_email)
      WHERE p.id = %s
        AND p.status = 'active'
        AND pt.status = 'active'
      LIMIT 1
    """

    update_participant_seen_sql = """
      UPDATE worldcup_pool.participants
      SET last_seen_at_utc = NOW()
      WHERE id = %s
      RETURNING
        id,
        display_name,
        email,
        status,
        joined_at_utc,
        last_seen_at_utc
    """

    insert_session_sql = """
      INSERT INTO worldcup_pool.sessions (
        pool_id,
        participant_id,
        owner_type,
        session_token_hash,
        user_agent,
        expires_at_utc
      )
      VALUES (
        %s,
        %s,
        'participant',
        %s,
        %s,
        %s
      )
    """

    insert_event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        %s,
        'organizer',
        %s,
        'organizer_opened_own_predictions',
        %s::jsonb
      )
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(participant_sql, (pool.id,))
                participant_row = cur.fetchone()

                if not participant_row:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "ok": False,
                            "code": "ORGANIZER_PARTICIPANT_NOT_FOUND",
                            "message": "Organizer participant was not found for this pool.",
                        },
                    )

                participant_id = int(participant_row[0])

                cur.execute(update_participant_seen_sql, (participant_id,))
                participant_row = cur.fetchone()

                if not participant_row:
                    raise RuntimeError("organizer_participant_update_returned_empty")

                cur.execute(
                    insert_session_sql,
                    (
                        pool.id,
                        participant_id,
                        session_token_hash,
                        user_agent[:500] if user_agent else None,
                        expires_at_utc,
                    ),
                )

                cur.execute(
                    insert_event_sql,
                    (
                        pool.id,
                        participant_id,
                        participant_id,
                        json.dumps(
                            {
                                "source": "public_worldcup_pool_admin_my_predictions",
                                "pool_slug": pool.slug,
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "ORGANIZER_PARTICIPANT_SESSION_FAILED",
                "message": f"Failed to create organizer participant session: {e}",
            },
        )

    _set_worldcup_pool_session_cookie(
        response=response,
        cookie_name=settings.worldcup_pool_participant_session_cookie_name,
        token=session_token,
        max_age_seconds=settings.worldcup_pool_session_ttl_days * 24 * 60 * 60,
        path=WORLDCUP_POOL_PARTICIPANT_COOKIE_PATH,
        request=request,
    )

    invite_url = _build_invite_url(
        origin=settings.product_public_origin,
        lang=str(pool.lang),
        invite_token=str(pool.invite_token),
    )
    participant_url = _build_participant_panel_url(
        origin=settings.product_public_origin,
        lang=str(pool.lang),
        invite_token=str(pool.invite_token),
    )

    return WorldCupPoolOrganizerParticipantSessionResponse(
        ok=True,
        participant_url=participant_url,
        invite_url=invite_url,
        participant=WorldCupPoolDashboardParticipant(
            id=int(participant_row[0]),
            display_name=str(participant_row[1]),
            email=str(participant_row[2]),
            status=str(participant_row[3]),
            joined_at_utc=_iso(participant_row[4]),
            last_seen_at_utc=_iso(participant_row[5]),
        ),
        participant_session_created=True,
    )

@router.get("/pools/{slug}/organizer", response_model=WorldCupPoolOrganizerDashboardResponse)
def get_worldcup_pool_organizer_dashboard(
    slug: str,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    q: Optional[str] = Query(default=None, max_length=80),
) -> WorldCupPoolOrganizerDashboardResponse:
    pool = _require_organizer_pool(slug, request)

    offset = (page - 1) * page_size
    query_text = (q or "").strip().lower()
    query_like = f"%{query_text}%"

    summary_sql = """
      SELECT
        COUNT(pt.id) FILTER (WHERE pt.status = 'active')::int AS active_participants,
        (
          SELECT COUNT(*)::int
          FROM worldcup_pool.matches m
          WHERE m.competition_key = 'fifa_world_cup_2026'
            AND m.status <> 'cancelled'
        ) AS available_matches
      FROM worldcup_pool.participants pt
      WHERE pt.pool_id = %s
    """

    filtered_count_sql = """
      SELECT COUNT(*)::int
      FROM worldcup_pool.participants pt
      WHERE pt.pool_id = %s
        AND pt.status = 'active'
        AND (%s = '' OR lower(pt.display_name) LIKE %s)
    """

    ranking_cte = """
      WITH ranked AS (
        SELECT
          pt.id AS participant_id,
          pt.display_name,
          pt.email,
          pt.status,
          (lower(pt.email) = lower(p.organizer_email)) AS is_organizer,
          pt.joined_at_utc,
          pt.last_seen_at_utc,
          pt.removed_at_utc,
          COALESCE(SUM(pr.points), 0)::int AS points,
          COUNT(DISTINCT pr.id)::int AS predictions_count,
          MAX(pr.updated_at_utc) AS last_prediction_at_utc,
          ROW_NUMBER() OVER (
            ORDER BY
              COALESCE(SUM(pr.points), 0) DESC,
              COUNT(pr.id) DESC,
              pt.joined_at_utc ASC,
              pt.id ASC
          )::int AS rank_position
        FROM worldcup_pool.participants pt
        JOIN worldcup_pool.pools p
          ON p.id = pt.pool_id
        LEFT JOIN worldcup_pool.predictions pr
          ON pr.pool_id = pt.pool_id
         AND pr.participant_id = pt.id
        WHERE pt.pool_id = %s
          AND pt.status = 'active'
        GROUP BY
          pt.id,
          pt.display_name,
          pt.email,
          pt.status,
          p.organizer_email,
          pt.joined_at_utc,
          pt.last_seen_at_utc,
          pt.removed_at_utc
      )
    """

    participants_sql = ranking_cte + """
      SELECT
        participant_id,
        rank_position,
        display_name,
        email,
        status,
        is_organizer,
        joined_at_utc,
        last_seen_at_utc,
        removed_at_utc,
        points,
        predictions_count,
        last_prediction_at_utc
      FROM ranked
      WHERE (%s = '' OR lower(display_name) LIKE %s)
      ORDER BY rank_position ASC
      LIMIT %s
      OFFSET %s
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(summary_sql, (pool.id,))
                summary_row = cur.fetchone() or (0, 0)

                cur.execute(filtered_count_sql, (pool.id, query_text, query_like))
                total_items = int((cur.fetchone() or [0])[0] or 0)

                cur.execute(
                    participants_sql,
                    (
                        pool.id,
                        query_text,
                        query_like,
                        page_size,
                        offset,
                    ),
                )
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "ORGANIZER_RANKING_LOOKUP_FAILED",
                "message": f"Failed to lookup organizer ranking: {e}",
            },
        )

    active_participants = int(summary_row[0] or 0)
    available_matches = int(summary_row[1] or 0)
    total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0

    participants = [
        WorldCupPoolOrganizerParticipant(
            id=int(row[0]),
            rank=int(row[1]),
            display_name=str(row[2]),
            email=str(row[3]),
            status=str(row[4]),
            is_organizer=bool(row[5]),
            joined_at_utc=_iso(row[6]),
            last_seen_at_utc=_iso(row[7]),
            removed_at_utc=_iso(row[8]),
            points=int(row[9] or 0),
            predictions_count=int(row[10] or 0),
            available_matches=available_matches,
            last_prediction_at_utc=_iso(row[11]),
        )
        for row in rows
    ]

    return WorldCupPoolOrganizerDashboardResponse(
        ok=True,
        pool=pool,
        summary=WorldCupPoolOrganizerSummary(
            active_participants=active_participants,
            filtered_participants=total_items,
            available_matches=available_matches,
        ),
        participants=participants,
        pagination=WorldCupPoolPagination(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        ),
    )



@router.post(
    "/pools/{slug}/organizer/participants/{participant_id}/remove",
    response_model=WorldCupPoolRemoveParticipantResponse,
)
def remove_worldcup_pool_participant(
    slug: str,
    participant_id: int,
    req: WorldCupPoolRemoveParticipantRequest,
    request: Request,
) -> WorldCupPoolRemoveParticipantResponse:
    pool = _require_organizer_pool(slug, request)

    update_sql = """
      UPDATE worldcup_pool.participants pt
      SET
        status = 'removed',
        removed_at_utc = NOW(),
        removed_by_pool_id = %s,
        removed_reason = %s
      FROM worldcup_pool.pools p
      WHERE pt.id = %s
        AND pt.pool_id = %s
        AND pt.pool_id = p.id
        AND pt.status = 'active'
        AND lower(pt.email) <> lower(p.organizer_email)
      RETURNING pt.id, pt.status
    """

    event_sql = """
      INSERT INTO worldcup_pool.events (
        pool_id,
        participant_id,
        actor_type,
        actor_id,
        event_name,
        payload
      )
      VALUES (
        %s,
        %s,
        'organizer',
        %s,
        'participant_removed',
        %s::jsonb
      )
    """

    try:
        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    update_sql,
                    (
                        pool.id,
                        req.reason.strip() if req.reason else None,
                        participant_id,
                        pool.id,
                    ),
                )
                row = cur.fetchone()

                if not row:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "ok": False,
                            "code": "PARTICIPANT_NOT_FOUND_OR_ALREADY_REMOVED",
                            "message": "Participant not found or already removed.",
                        },
                    )

                cur.execute(
                    event_sql,
                    (
                        pool.id,
                        int(row[0]),
                        pool.id,
                        json.dumps(
                            {
                                "participant_id": int(row[0]),
                                "reason": req.reason.strip() if req.reason else None,
                            }
                        ),
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "code": "PARTICIPANT_REMOVE_FAILED",
                "message": f"Failed to remove participant: {e}",
            },
        )

    return WorldCupPoolRemoveParticipantResponse(
        ok=True,
        participant_id=int(row[0]),
        status=str(row[1]),
    )