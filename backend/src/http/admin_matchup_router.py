# Backward-compat router shim.
# Some older code paths import admin_matchup_router, but the actual endpoints live elsewhere.

from src.http.admin_odds_router import router  # re-export