import unittest
from copy import deepcopy

from src.tools.bankroll.domain import (
    ActiveBankrollAccountExists,
    BankrollEntryLimitReached,
    BankrollResourceNotFound,
)
from src.tools.bankroll.service import BankrollService, BankrollServiceError


def free_access(_user_id, _tool_code):
    return {
        "tool_code": "BANKROLL_MANAGER",
        "access": "free",
        "limits": {"max_entries": 5},
        "available": True,
    }


def lifetime_access(_user_id, _tool_code):
    return {
        "tool_code": "BANKROLL_MANAGER",
        "access": "lifetime",
        "limits": {"max_entries": None},
        "available": True,
    }


def unavailable_access(_user_id, _tool_code):
    return {
        "tool_code": "BANKROLL_MANAGER",
        "access": "unavailable",
        "limits": {},
        "available": False,
    }


def entry_payload(index=1):
    return {
        "event_name": f"Evento {index}",
        "bookmaker": "Book",
        "market": "Resultado",
        "selection": "Casa",
        "odds_decimal": "2.10",
        "stake_cents": 1000,
        "result": "pending",
    }


class FakeBankrollRepository:
    def __init__(self):
        self.accounts = {}
        self.entries = {}
        self.next_account_id = 1
        self.next_entry_id = 1

    def create_account(self, user_id, data):
        if any(a["user_id"] == user_id and a["status"] == "active" for a in self.accounts.values()):
            raise ActiveBankrollAccountExists()
        account = {
            "account_id": self.next_account_id,
            "user_id": user_id,
            "status": "active",
            **deepcopy(data),
        }
        self.accounts[self.next_account_id] = account
        self.next_account_id += 1
        return deepcopy(account)

    def get_active_account(self, user_id):
        for account in self.accounts.values():
            if account["user_id"] == user_id and account["status"] == "active":
                return deepcopy(account)
        return None

    def update_account(self, user_id, account_id, data):
        account = self.accounts.get(account_id)
        if not account or account["user_id"] != user_id:
            return None
        account.update(deepcopy(data))
        return deepcopy(account)

    def create_entry(self, user_id, account_id, data, *, max_entries):
        account = self.accounts.get(account_id)
        if not account or account["user_id"] != user_id:
            raise BankrollResourceNotFound()
        active_count = sum(
            1 for item in self.entries.values()
            if item["user_id"] == user_id and item.get("deleted_at_utc") is None
        )
        if max_entries is not None and active_count >= max_entries:
            raise BankrollEntryLimitReached(max_entries)
        item = {
            "entry_id": self.next_entry_id,
            "account_id": account_id,
            "user_id": user_id,
            "deleted_at_utc": None,
            **deepcopy(data),
        }
        self.entries[self.next_entry_id] = item
        self.next_entry_id += 1
        return deepcopy(item)

    def get_entry(self, user_id, entry_id):
        item = self.entries.get(entry_id)
        if not item or item["user_id"] != user_id or item.get("deleted_at_utc") is not None:
            return None
        return deepcopy(item)

    def update_entry(self, user_id, entry_id, data):
        item = self.entries.get(entry_id)
        if not item or item["user_id"] != user_id or item.get("deleted_at_utc") is not None:
            return None
        item.update(deepcopy(data))
        return deepcopy(item)

    def soft_delete_entry(self, user_id, entry_id):
        item = self.entries.get(entry_id)
        if not item or item["user_id"] != user_id or item.get("deleted_at_utc") is not None:
            return False
        item["deleted_at_utc"] = "deleted"
        return True

    def list_entries(self, user_id, *, limit, offset):
        items = [
            deepcopy(item) for item in self.entries.values()
            if item["user_id"] == user_id and item.get("deleted_at_utc") is None
        ]
        return items[offset:offset + limit]

    def list_entries_for_summary(self, user_id, account_id):
        return [
            deepcopy(item) for item in self.entries.values()
            if item["user_id"] == user_id
            and item["account_id"] == account_id
            and item.get("deleted_at_utc") is None
        ]


class BankrollAccessAndLimitTests(unittest.TestCase):
    def setUp(self):
        self.repository = FakeBankrollRepository()
        self.free_service = BankrollService(self.repository, free_access)
        self.free_service.create_account(
            1,
            {"name": "Minha banca", "currency_code": "BRL", "initial_balance_cents": 100000},
        )

    def test_unavailable_tool_blocks_bankroll(self):
        service = BankrollService(self.repository, unavailable_access)
        with self.assertRaises(BankrollServiceError) as ctx:
            service.list_entries(1)
        self.assertEqual(ctx.exception.code, "TOOL_UNAVAILABLE")

    def test_missing_free_limit_fails_closed(self):
        def malformed_free_access(_user_id, _tool_code):
            return {"access": "free", "limits": {}, "available": True}

        service = BankrollService(self.repository, malformed_free_access)
        with self.assertRaises(BankrollServiceError) as ctx:
            service.create_entry(1, entry_payload())
        self.assertEqual(ctx.exception.code, "TOOL_LIMIT_CONFIG_INVALID")

    def test_free_allows_five_and_blocks_sixth(self):
        for index in range(1, 6):
            self.free_service.create_entry(1, entry_payload(index))
        with self.assertRaises(BankrollServiceError) as ctx:
            self.free_service.create_entry(1, entry_payload(6))
        self.assertEqual(ctx.exception.code, "TOOL_FREE_LIMIT_REACHED")
        self.assertEqual(ctx.exception.details["limit"], 5)

    def test_free_limit_is_read_from_access_configuration(self):
        def two_entry_access(_user_id, _tool_code):
            return {
                "access": "free",
                "limits": {"max_entries": 2},
                "available": True,
            }

        service = BankrollService(self.repository, two_entry_access)
        service.create_entry(1, entry_payload(1))
        service.create_entry(1, entry_payload(2))
        with self.assertRaises(BankrollServiceError) as ctx:
            service.create_entry(1, entry_payload(3))
        self.assertEqual(ctx.exception.details["limit"], 2)

    def test_delete_releases_free_slot(self):
        created = [self.free_service.create_entry(1, entry_payload(index))["entry"] for index in range(1, 6)]
        self.free_service.delete_entry(1, created[0]["entry_id"])
        sixth = self.free_service.create_entry(1, entry_payload(6))
        self.assertEqual(sixth["entry"]["event_name"], "Evento 6")

    def test_lifetime_is_unlimited(self):
        service = BankrollService(self.repository, lifetime_access)
        for index in range(1, 9):
            service.create_entry(1, entry_payload(index))
        self.assertEqual(service.list_entries(1)["count"], 8)


class BankrollOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.repository = FakeBankrollRepository()
        self.service = BankrollService(self.repository, lifetime_access)
        self.account_a = self.service.create_account(
            10,
            {"name": "A", "currency_code": "BRL", "initial_balance_cents": 10000},
        )["account"]
        self.account_b = self.service.create_account(
            20,
            {"name": "B", "currency_code": "USD", "initial_balance_cents": 20000},
        )["account"]
        self.entry_b = self.service.create_entry(20, entry_payload())["entry"]

    def test_user_does_not_list_other_users_entries(self):
        self.assertEqual(self.service.list_entries(10)["items"], [])

    def test_user_cannot_update_other_users_entry(self):
        with self.assertRaises(BankrollServiceError) as ctx:
            self.service.update_entry(10, self.entry_b["entry_id"], {"notes": "intrusion"})
        self.assertEqual(ctx.exception.code, "BANKROLL_ENTRY_NOT_FOUND")

    def test_user_cannot_delete_other_users_entry(self):
        with self.assertRaises(BankrollServiceError) as ctx:
            self.service.delete_entry(10, self.entry_b["entry_id"])
        self.assertEqual(ctx.exception.code, "BANKROLL_ENTRY_NOT_FOUND")

    def test_user_cannot_update_other_users_account(self):
        with self.assertRaises(BankrollServiceError) as ctx:
            self.service.update_account(10, self.account_b["account_id"], {"name": "intrusion"})
        self.assertEqual(ctx.exception.code, "BANKROLL_ACCOUNT_NOT_FOUND")

    def test_user_cannot_create_entry_in_other_users_account(self):
        payload = {**entry_payload(), "account_id": self.account_b["account_id"]}
        with self.assertRaises(BankrollServiceError) as ctx:
            self.service.create_entry(10, payload)
        self.assertEqual(ctx.exception.code, "BANKROLL_ACCOUNT_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
