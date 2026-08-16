from __future__ import annotations

from typing import Any, Callable, Dict, Mapping, Optional

from src.tools.bankroll.domain import (
    TOOL_CODE,
    ActiveBankrollAccountExists,
    BankrollEntryLimitReached,
    BankrollResourceNotFound,
    BankrollValidationError,
    calculate_summary,
    normalize_account_create,
    normalize_account_patch,
    normalize_entry,
)


class BankrollServiceError(RuntimeError):
    def __init__(self, code: str, *, status_code: int, **details: Any):
        super().__init__(code)
        self.code = code
        self.status_code = int(status_code)
        self.details = details


class BankrollService:
    def __init__(self, repository: Any = None, access_resolver: Optional[Callable[..., Dict[str, Any]]] = None):
        if repository is None:
            from src.tools.bankroll.repository import PostgresBankrollRepository

            repository = PostgresBankrollRepository()
        if access_resolver is None:
            from src.tools.service import resolve_tool_access

            access_resolver = resolve_tool_access
        self.repository = repository
        self.access_resolver = access_resolver

    def _resolve_access(self, user_id: int) -> Dict[str, Any]:
        access = self.access_resolver(int(user_id), TOOL_CODE)
        if not access.get("available") or access.get("access") == "unavailable":
            raise BankrollServiceError("TOOL_UNAVAILABLE", status_code=403, tool_code=TOOL_CODE)
        return access

    @staticmethod
    def _max_entries(access: Mapping[str, Any]) -> Optional[int]:
        access_level = str(access.get("access") or "").lower()
        if access_level == "lifetime":
            return None
        if access_level != "free":
            raise BankrollServiceError("TOOL_UNAVAILABLE", status_code=403, tool_code=TOOL_CODE)
        raw_limit = (access.get("limits") or {}).get("max_entries")
        if raw_limit is None:
            raise BankrollServiceError("TOOL_LIMIT_CONFIG_INVALID", status_code=500)
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError) as exc:
            raise BankrollServiceError("TOOL_LIMIT_CONFIG_INVALID", status_code=500) from exc
        if limit < 0:
            raise BankrollServiceError("TOOL_LIMIT_CONFIG_INVALID", status_code=500)
        return limit

    @staticmethod
    def _raise_validation(exc: BankrollValidationError) -> None:
        raise BankrollServiceError(exc.code, status_code=422, **exc.details) from exc

    def create_account(self, user_id: int, payload: Mapping[str, Any]) -> Dict[str, Any]:
        self._resolve_access(user_id)
        try:
            data = normalize_account_create(payload)
            account = self.repository.create_account(int(user_id), data)
        except BankrollValidationError as exc:
            self._raise_validation(exc)
        except ActiveBankrollAccountExists as exc:
            raise BankrollServiceError("BANKROLL_ACTIVE_ACCOUNT_EXISTS", status_code=409) from exc
        except BankrollResourceNotFound as exc:
            raise BankrollServiceError("BANKROLL_USER_NOT_FOUND", status_code=404) from exc
        return {"ok": True, "account": account}

    def update_account(self, user_id: int, account_id: int, payload: Mapping[str, Any]) -> Dict[str, Any]:
        self._resolve_access(user_id)
        try:
            data = normalize_account_patch(payload)
        except BankrollValidationError as exc:
            self._raise_validation(exc)
        account = self.repository.update_account(int(user_id), int(account_id), data)
        if account is None:
            raise BankrollServiceError("BANKROLL_ACCOUNT_NOT_FOUND", status_code=404)
        return {"ok": True, "account": account}

    def list_entries(self, user_id: int, *, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        self._resolve_access(user_id)
        items = self.repository.list_entries(int(user_id), limit=int(limit), offset=int(offset))
        return {
            "ok": True,
            "items": items,
            "count": len(items),
            "limit": int(limit),
            "offset": int(offset),
        }

    def create_entry(self, user_id: int, payload: Mapping[str, Any]) -> Dict[str, Any]:
        access = self._resolve_access(user_id)
        account_id = payload.get("account_id")
        if account_id is None:
            account = self.repository.get_active_account(int(user_id))
            if account is None:
                raise BankrollServiceError("BANKROLL_ACCOUNT_REQUIRED", status_code=409)
            account_id = account["account_id"]

        entry_payload = {key: value for key, value in payload.items() if key != "account_id"}
        try:
            data = normalize_entry(entry_payload)
            entry = self.repository.create_entry(
                int(user_id),
                int(account_id),
                data,
                max_entries=self._max_entries(access),
            )
        except BankrollValidationError as exc:
            self._raise_validation(exc)
        except BankrollEntryLimitReached as exc:
            raise BankrollServiceError(
                "TOOL_FREE_LIMIT_REACHED",
                status_code=409,
                tool_code=TOOL_CODE,
                limit=exc.limit,
            ) from exc
        except BankrollResourceNotFound as exc:
            raise BankrollServiceError("BANKROLL_ACCOUNT_NOT_FOUND", status_code=404) from exc
        return {"ok": True, "entry": entry}

    def update_entry(self, user_id: int, entry_id: int, payload: Mapping[str, Any]) -> Dict[str, Any]:
        self._resolve_access(user_id)
        if not payload:
            raise BankrollServiceError("BANKROLL_EMPTY_UPDATE", status_code=422)
        current = self.repository.get_entry(int(user_id), int(entry_id))
        if current is None:
            raise BankrollServiceError("BANKROLL_ENTRY_NOT_FOUND", status_code=404)
        try:
            data = normalize_entry(payload, current=current)
        except BankrollValidationError as exc:
            self._raise_validation(exc)
        entry = self.repository.update_entry(int(user_id), int(entry_id), data)
        if entry is None:
            raise BankrollServiceError("BANKROLL_ENTRY_NOT_FOUND", status_code=404)
        return {"ok": True, "entry": entry}

    def delete_entry(self, user_id: int, entry_id: int) -> Dict[str, Any]:
        self._resolve_access(user_id)
        try:
            deleted = self.repository.soft_delete_entry(int(user_id), int(entry_id))
        except BankrollResourceNotFound as exc:
            raise BankrollServiceError("BANKROLL_ENTRY_NOT_FOUND", status_code=404) from exc
        if not deleted:
            raise BankrollServiceError("BANKROLL_ENTRY_NOT_FOUND", status_code=404)
        return {"ok": True, "entry_id": int(entry_id), "deleted": True}

    def get_summary(self, user_id: int) -> Dict[str, Any]:
        self._resolve_access(user_id)
        account = self.repository.get_active_account(int(user_id))
        if account is None:
            return {"ok": True, "summary": calculate_summary(0, [])}
        entries = self.repository.list_entries_for_summary(int(user_id), int(account["account_id"]))
        return {
            "ok": True,
            "summary": calculate_summary(account["initial_balance_cents"], entries),
        }

    def bootstrap(self, user_id: int, *, entries_limit: int = 50) -> Dict[str, Any]:
        access = self._resolve_access(user_id)
        account = self.repository.get_active_account(int(user_id))
        if account is None:
            entries = []
            summary = calculate_summary(0, [])
        else:
            entries = self.repository.list_entries(int(user_id), limit=int(entries_limit), offset=0)
            summary_entries = self.repository.list_entries_for_summary(int(user_id), int(account["account_id"]))
            summary = calculate_summary(account["initial_balance_cents"], summary_entries)
        return {
            "ok": True,
            "tool": access,
            "account": account,
            "summary": summary,
            "entries": entries,
        }
