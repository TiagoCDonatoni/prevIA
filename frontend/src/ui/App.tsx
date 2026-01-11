import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "../views/Dashboard";
import MatchupLab from "../views/MatchupLab";
import TeamExplorer from "../views/TeamExplorer";
import Artifacts from "../views/Artifacts";
import Runs from "../views/Runs";

function Topbar() {
  return (
    <div className="topbar">
      <div className="brand">
        <h1>prevIA — Admin v1</h1>
        <div className="sub">Tech console (minimal) • Contracts-first • Gray theme</div>
      </div>
      <nav className="nav" aria-label="Primary navigation">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Dashboard
        </NavLink>
        <NavLink to="/matchup" className={({ isActive }) => (isActive ? "active" : "")}>
          Matchup Lab
        </NavLink>
        <NavLink to="/team" className={({ isActive }) => (isActive ? "active" : "")}>
          Team Explorer
        </NavLink>
        <NavLink to="/artifacts" className={({ isActive }) => (isActive ? "active" : "")}>
          Artifacts
        </NavLink>
        <NavLink to="/runs" className={({ isActive }) => (isActive ? "active" : "")}>
          Runs
        </NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <div className="container">
      <Topbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/matchup" element={<MatchupLab />} />
        <Route path="/team" element={<TeamExplorer />} />
        <Route path="/artifacts" element={<Artifacts />} />
        <Route path="/runs" element={<Runs />} />
      </Routes>
    </div>
  );
}
