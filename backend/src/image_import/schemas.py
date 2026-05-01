from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ImageImportStatus = Literal[
    "READY",
    "NEEDS_CONFIRMATION",
    "UNSUPPORTED_MARKET",
    "LOW_CONFIDENCE",
    "UNREADABLE",
]


class ImageImportRawItem(BaseModel):
    home: Optional[str] = None
    away: Optional[str] = None
    league: Optional[str] = None
    kickoff: Optional[str] = None
    kickoff_iso_local: Optional[str] = None
    market: Optional[str] = None
    selection: Optional[str] = None
    line: Optional[str] = None
    odd: Optional[str] = None
    bookmaker: Optional[str] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None


class ImageImportNormalizedItem(BaseModel):
    market_key: Optional[str] = None
    selection_key: Optional[str] = None
    line: Optional[float] = None
    odds_value: Optional[float] = None
    line_was_defaulted: bool = False


class ImageImportResolvedItem(BaseModel):
    fixture_id: Optional[int] = None
    home_team_id: Optional[int] = None
    away_team_id: Optional[int] = None
    home_name: Optional[str] = None
    away_name: Optional[str] = None
    kickoff_utc: Optional[str] = None
    confidence: Optional[float] = None


class ImageImportCandidate(BaseModel):
    fixture_id: Optional[int] = None
    home_team_id: Optional[int] = None
    away_team_id: Optional[int] = None
    home_name: Optional[str] = None
    away_name: Optional[str] = None
    kickoff_utc: Optional[str] = None
    confidence: Optional[float] = None
    reason: Optional[str] = None


class ImageImportPreviewItem(BaseModel):
    row_id: int
    row_index: int
    status: ImageImportStatus
    raw: ImageImportRawItem = Field(default_factory=ImageImportRawItem)
    normalized: ImageImportNormalizedItem = Field(default_factory=ImageImportNormalizedItem)
    resolved: ImageImportResolvedItem = Field(default_factory=ImageImportResolvedItem)
    candidates: List[ImageImportCandidate] = Field(default_factory=list)
    message: Optional[str] = None


class ImageImportUsagePayload(BaseModel):
    upload_attempts_today: int
    accepted_uploads_today: int
    rejected_uploads_today: int
    generated_analyses_today: int
    uploads_remaining_today: int
    blocked_until_utc: Optional[str] = None
    risk_score: float = 0


class ImageImportPreviewResponse(BaseModel):
    ok: bool
    request_id: int
    image_type: str
    status: str
    summary: Dict[str, int]
    usage: ImageImportUsagePayload
    items: List[ImageImportPreviewItem]


class ImageImportBatchEvaluateRequest(BaseModel):
    request_id: int
    row_ids: List[int]


class ImageImportBatchEvaluateResponse(BaseModel):
    ok: bool
    credits_required: int = 0
    credits_consumed: int = 0
    remaining_credits: Optional[int] = None
    analyses: List[Dict[str, Any]] = Field(default_factory=list)
    skipped: List[Dict[str, Any]] = Field(default_factory=list)
    code: Optional[str] = None
    message: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None