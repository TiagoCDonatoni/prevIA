import { useMemo, useState } from "react";

import "./styles.css";

import Dashboard from "./views/Dashboard";
import OpsOverview from "./views/OpsOverview";
import OpsJobsRuns from "./views/OpsJobsRuns";
import OpsQueue from "./views/OpsQueue";
import OpsFailures from "./views/OpsFailures";
import OpsFreshness from "./views/OpsFreshness";
import MatchupLab from "./views/MatchupLab";
import TeamExplorer from "./views/TeamExplorer";
import OddsIntel from "./views/OddsIntel";
import OddsMarketTotals from "./views/OddsMarketTotals";
import OddsMarketBtts from "./views/OddsMarketBtts";
import AdminLeagues from "./views/AdminLeagues";
import AdminUsers from "./views/AdminUsers";

type Page =
  | "dashboard"
  | "ops_overview"
  | "ops_jobs_runs"
  | "ops_queue"
  | "ops_failures"
  | "ops_freshness"
  | "matchup"
  | "team"
  | "odds"
  | "odds_totals"
  | "odds_btts"
  | "users"
  | "leagues";

type MacroAreaKey = "overview" | "ops" | "product" | "backoffice";

type NavSection = {
  key: MacroAreaKey;
  label: string;
  items: Array<{ key: Page; label: string }>;
};

const NAV_SECTIONS: NavSection[] = [
  {
    key: "overview",
    label: "Visão Geral",
    items: [{ key: "dashboard", label: "Dashboard" }],
  },
  {
    key: "ops",
    label: "Ops",
    items: [
      { key: "ops_overview", label: "Overview" },
      { key: "ops_jobs_runs", label: "Jobs & Runs" },
      { key: "ops_queue", label: "Queue" },
      { key: "ops_failures", label: "Failures" },
      { key: "ops_freshness", label: "Freshness" },
      { key: "odds", label: "Odds Intel" },
      { key: "odds_totals", label: "Odds Totais" },
      { key: "odds_btts", label: "Odds BTTS" },
      { key: "leagues", label: "Ligas" },
    ],
  },
  {
    key: "product",
    label: "Produto & Modelos",
    items: [
      { key: "matchup", label: "Matchup" },
      { key: "team", label: "Team Explorer" },
    ],
  },
  {
    key: "backoffice",
    label: "Backoffice",
    items: [{ key: "users", label: "Users" }],
  },
];

function getMacroAreaForPage(page: Page): MacroAreaKey {
  for (const section of NAV_SECTIONS) {
    if (section.items.some((item) => item.key === page)) {
      return section.key;
    }
  }
  return "overview";
}

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");

  const activeMacroArea = useMemo(() => getMacroAreaForPage(page), [page]);
  const activeSection =
    NAV_SECTIONS.find((section) => section.key === activeMacroArea) ??
    NAV_SECTIONS[0];

  return (
    <div className="app">
      <div className="topbar topbar-admin">
        <div className="brand brand-admin">
          <div>
            <div className="brand-title">prevIA Admin</div>
            <div className="brand-sub">hierarquia v1</div>
          </div>
        </div>

        <div className="nav nav-admin nav-macroareas">
          {NAV_SECTIONS.map((section) => (
            <button
              key={section.key}
              className={`nav-btn ${activeMacroArea === section.key ? "active" : ""}`}
              onClick={() => setPage(section.items[0].key)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      <div className="content content-admin">
        <div className="admin-shell">
          <div className="admin-subnav-card">
            <div className="admin-subnav-meta">
              <div className="admin-subnav-title">{activeSection.label}</div>
              <div className="admin-subnav-copy">
                Páginas agrupadas por macroárea para preparar a evolução do Admin.
              </div>
            </div>

            <div className="nav nav-admin nav-subpages">
              {activeSection.items.map((item) => (
                <button
                  key={item.key}
                  className={`nav-btn ${page === item.key ? "active" : ""}`}
                  onClick={() => setPage(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {page === "dashboard" && <Dashboard />}
          {page === "ops_overview" && <OpsOverview />}
          {page === "ops_jobs_runs" && <OpsJobsRuns />}
          {page === "ops_queue" && <OpsQueue />}
          {page === "ops_failures" && <OpsFailures />}
          {page === "ops_freshness" && <OpsFreshness />}
          {page === "matchup" && <MatchupLab />}
          {page === "team" && <TeamExplorer />}
          {page === "odds" && <OddsIntel />}
          {page === "odds_totals" && <OddsMarketTotals />}
          {page === "odds_btts" && <OddsMarketBtts />}
          {page === "users" && <AdminUsers />}
          {page === "leagues" && <AdminLeagues />}
        </div>
      </div>
    </div>
  );
}