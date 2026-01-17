import { useState } from "react";

import "./styles.css";

import Dashboard from "./views/Dashboard";
import MatchupLab from "./views/MatchupLab";
import TeamExplorer from "./views/TeamExplorer";

type Page = "dashboard" | "matchup" | "team";

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
        </div>
      </div>

      <div className="content">
        {page === "dashboard" && <Dashboard />}
        {page === "matchup" && <MatchupLab />}
        {page === "team" && <TeamExplorer />}
      </div>
    </div>
  );
}
