import { useState } from "react";

import "./styles.css";

import Dashboard from "./views/Dashboard";
import MatchupLab from "./views/MatchupLab";
import TeamExplorer from "./views/TeamExplorer";
import OddsIntel from "./views/OddsIntel";
import OddsMarketTotals from "./views/OddsMarketTotals";
import OddsMarketBtts from "./views/OddsMarketBtts";
import AdminLeagues from "./views/AdminLeagues";

type Page = "dashboard" | "matchup" | "team" | "odds" | "odds_totals" | "odds_btts" | "leagues";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-title">prevIA Admin</div>
          <div className="brand-sub">v1</div>
        </div>

        <div className="nav">
          <button
            className={`nav-btn ${page === "dashboard" ? "active" : ""}`}
            onClick={() => setPage("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-btn ${page === "matchup" ? "active" : ""}`}
            onClick={() => setPage("matchup")}
          >
            Matchup
          </button>
          <button
            className={`nav-btn ${page === "team" ? "active" : ""}`}
            onClick={() => setPage("team")}
          >
            Team Explorer
          </button>
          <button
            className={`nav-btn ${page === "odds" ? "active" : ""}`}
            onClick={() => setPage("odds")}
          >
            Odds Intel
          </button>

          <button
            className={`nav-btn ${page === "odds_totals" ? "active" : ""}`}
            onClick={() => setPage("odds_totals")}
          >
            Odds Totais
          </button>

          <button
            className={`nav-btn ${page === "odds_btts" ? "active" : ""}`}
            onClick={() => setPage("odds_btts")}
          >
            Odds BTTS
          </button>

          <button
            className={`nav-btn ${page === "leagues" ? "active" : ""}`}
            onClick={() => setPage("leagues")}
          >
            Ligas
          </button>
        </div>
      </div>

      <div className="content">
        {page === "dashboard" && <Dashboard />}
        {page === "matchup" && <MatchupLab />}
        {page === "team" && <TeamExplorer />}
        {page === "odds" && <OddsIntel />}
        {page === "odds_totals" && <OddsMarketTotals />}
        {page === "odds_btts" && <OddsMarketBtts />}
        {page === "leagues" && <AdminLeagues />}
      </div>
    </div>
  );
}
