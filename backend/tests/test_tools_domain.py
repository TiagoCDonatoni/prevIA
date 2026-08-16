import unittest
from types import SimpleNamespace

from src.tools.domain import resolve_tool_access_record
from src.tools.feature_flags import get_enabled_tool_codes


TOOL = {
    "tool_code": "BANKROLL_MANAGER",
    "active": True,
    "free_enabled": True,
    "limits_config_json": {
        "free": {"max_entries": 5},
        "paid": {"max_entries": None},
    },
}


class ResolveToolAccessRecordTests(unittest.TestCase):
    def test_free_access_uses_catalog_limit(self):
        result = resolve_tool_access_record(TOOL)

        self.assertEqual(result["access"], "free")
        self.assertEqual(result["limits"], {"max_entries": 5})
        self.assertTrue(result["available"])

    def test_lifetime_access_uses_paid_limits(self):
        result = resolve_tool_access_record(
            TOOL,
            {"entitlement_type": "lifetime", "status": "active"},
        )

        self.assertEqual(result["access"], "lifetime")
        self.assertEqual(result["limits"], {"max_entries": None})
        self.assertTrue(result["available"])

    def test_inactive_tool_is_unavailable_even_with_entitlement(self):
        result = resolve_tool_access_record(
            {**TOOL, "active": False},
            {"entitlement_type": "lifetime", "status": "active"},
        )

        self.assertEqual(result["access"], "unavailable")
        self.assertEqual(result["limits"], {})
        self.assertFalse(result["available"])

    def test_paid_only_tool_without_entitlement_is_unavailable(self):
        result = resolve_tool_access_record({**TOOL, "free_enabled": False})

        self.assertEqual(result["access"], "unavailable")
        self.assertEqual(result["limits"], {})
        self.assertFalse(result["available"])

    def test_revoked_entitlement_falls_back_to_free(self):
        result = resolve_tool_access_record(
            TOOL,
            {"entitlement_type": "lifetime", "status": "revoked"},
        )

        self.assertEqual(result["access"], "free")
        self.assertEqual(result["limits"], {"max_entries": 5})


class ToolFeatureFlagTests(unittest.TestCase):
    def test_global_flag_disables_all_tools(self):
        settings = SimpleNamespace(
            tools_enabled=False,
            tools_bankroll_enabled=True,
        )

        self.assertEqual(get_enabled_tool_codes(settings), set())

    def test_specific_flag_disables_bankroll(self):
        settings = SimpleNamespace(
            tools_enabled=True,
            tools_bankroll_enabled=False,
        )

        self.assertEqual(get_enabled_tool_codes(settings), set())

    def test_global_and_specific_flags_enable_bankroll(self):
        settings = SimpleNamespace(
            tools_enabled=True,
            tools_bankroll_enabled=True,
        )

        self.assertEqual(get_enabled_tool_codes(settings), {"BANKROLL_MANAGER"})


if __name__ == "__main__":
    unittest.main()
