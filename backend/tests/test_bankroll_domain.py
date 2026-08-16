import unittest
from datetime import datetime, timezone

from src.tools.bankroll.domain import (
    BankrollValidationError,
    calculate_summary,
    normalize_entry,
)


NOW = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


def entry(
    result="pending",
    *,
    stake_cents=10000,
    return_cents=None,
    odds_decimal="2.00",
):
    return {
        "result": result,
        "stake_cents": stake_cents,
        "return_cents": return_cents,
        "odds_decimal": odds_decimal,
    }


def create_payload(**overrides):
    payload = {
        "placed_at_utc": NOW,
        "event_name": "Time A x Time B",
        "bookmaker": "Book",
        "market": "Resultado",
        "selection": "Time A",
        "odds_decimal": "2.15",
        "stake_cents": 10000,
        "result": "pending",
        "return_cents": None,
        "notes": None,
    }
    payload.update(overrides)
    return payload


class BankrollSettlementTests(unittest.TestCase):
    def test_pending_clears_return_and_settlement(self):
        result = normalize_entry(create_payload(return_cents=999), now=NOW)
        self.assertIsNone(result["return_cents"])
        self.assertIsNone(result["settled_at_utc"])

    def test_won_requires_profitable_return(self):
        with self.assertRaises(BankrollValidationError) as ctx:
            normalize_entry(create_payload(result="won", return_cents=10000), now=NOW)
        self.assertEqual(ctx.exception.code, "BANKROLL_INCONSISTENT_RETURN")

    def test_lost_normalizes_return_to_zero(self):
        result = normalize_entry(create_payload(result="lost", return_cents=5000), now=NOW)
        self.assertEqual(result["return_cents"], 0)
        self.assertEqual(result["settled_at_utc"], NOW)

    def test_void_normalizes_return_to_stake(self):
        result = normalize_entry(create_payload(result="void"), now=NOW)
        self.assertEqual(result["return_cents"], 10000)

    def test_cashout_requires_return(self):
        with self.assertRaises(BankrollValidationError) as ctx:
            normalize_entry(create_payload(result="cashout"), now=NOW)
        self.assertEqual(ctx.exception.code, "BANKROLL_RETURN_REQUIRED")

    def test_settled_to_pending_clears_settlement(self):
        current = normalize_entry(create_payload(result="won", return_cents=21500), now=NOW)
        result = normalize_entry({"result": "pending"}, current=current, now=NOW)
        self.assertIsNone(result["return_cents"])
        self.assertIsNone(result["settled_at_utc"])

    def test_patch_rejects_null_result_and_placed_at(self):
        current = normalize_entry(create_payload(), now=NOW)
        cases = [
            ({"result": None}, "BANKROLL_INVALID_RESULT"),
            ({"placed_at_utc": None}, "BANKROLL_INVALID_DATETIME"),
        ]
        for patch, code in cases:
            with self.subTest(patch=patch), self.assertRaises(BankrollValidationError) as ctx:
                normalize_entry(patch, current=current, now=NOW)
            self.assertEqual(ctx.exception.code, code)


class BankrollValidationTests(unittest.TestCase):
    def test_zero_and_negative_stakes_are_invalid(self):
        for stake in (0, -1, 1.5, "1.5"):
            with self.subTest(stake=stake), self.assertRaises(BankrollValidationError) as ctx:
                normalize_entry(create_payload(stake_cents=stake), now=NOW)
            self.assertEqual(ctx.exception.code, "BANKROLL_INVALID_STAKE")

    def test_invalid_odds_are_rejected(self):
        for odds in ("1.00", "0.50", "not-a-number", "10000.01"):
            with self.subTest(odds=odds), self.assertRaises(BankrollValidationError) as ctx:
                normalize_entry(create_payload(odds_decimal=odds), now=NOW)
            self.assertEqual(ctx.exception.code, "BANKROLL_INVALID_ODDS")

    def test_invalid_result_is_rejected(self):
        with self.assertRaises(BankrollValidationError) as ctx:
            normalize_entry(create_payload(result="half_won"), now=NOW)
        self.assertEqual(ctx.exception.code, "BANKROLL_INVALID_RESULT")


class BankrollSummaryTests(unittest.TestCase):
    def test_empty_bankroll(self):
        summary = calculate_summary(100000, [])
        self.assertEqual(summary["available_balance_cents"], 100000)
        self.assertEqual(summary["entries_count"], 0)
        self.assertEqual(summary["roi"], 0.0)
        self.assertEqual(summary["win_rate"], 0.0)
        self.assertEqual(summary["average_odds"], 0.0)

    def test_pending_reserves_stake(self):
        summary = calculate_summary(100000, [entry("pending", stake_cents=5000)])
        self.assertEqual(summary["pending_staked_cents"], 5000)
        self.assertEqual(summary["available_balance_cents"], 95000)
        self.assertEqual(summary["realized_profit_cents"], 0)

    def test_won_lost_void_and_cashouts(self):
        entries = [
            entry("won", stake_cents=10000, return_cents=21500, odds_decimal="2.15"),
            entry("lost", stake_cents=10000, return_cents=0, odds_decimal="1.85"),
            entry("void", stake_cents=5000, return_cents=5000, odds_decimal="2.00"),
            entry("cashout", stake_cents=8000, return_cents=10000, odds_decimal="3.00"),
            entry("cashout", stake_cents=7000, return_cents=4000, odds_decimal="1.50"),
            entry("pending", stake_cents=6000, odds_decimal="2.50"),
        ]
        summary = calculate_summary(100000, entries)

        self.assertEqual(summary["realized_profit_cents"], 500)
        self.assertEqual(summary["total_staked_cents"], 46000)
        self.assertEqual(summary["settled_staked_cents"], 40000)
        self.assertEqual(summary["pending_staked_cents"], 6000)
        self.assertEqual(summary["available_balance_cents"], 94500)
        self.assertEqual(summary["entries_count"], 6)
        self.assertEqual(summary["won_count"], 1)
        self.assertEqual(summary["lost_count"], 1)
        self.assertEqual(summary["void_count"], 1)
        self.assertEqual(summary["cashout_count"], 2)
        self.assertEqual(summary["pending_count"], 1)
        self.assertEqual(summary["win_rate"], 0.5)
        self.assertEqual(summary["roi"], 0.0125)
        self.assertEqual(summary["average_odds"], 2.1667)

    def test_individual_profit_rules(self):
        cases = [
            (entry("won", return_cents=22000), 12000),
            (entry("lost", return_cents=0), -10000),
            (entry("void", return_cents=10000), 0),
            (entry("cashout", return_cents=12000), 2000),
            (entry("cashout", return_cents=7000), -3000),
        ]
        for item, expected in cases:
            with self.subTest(result=item["result"], expected=expected):
                self.assertEqual(calculate_summary(100000, [item])["realized_profit_cents"], expected)


if __name__ == "__main__":
    unittest.main()
