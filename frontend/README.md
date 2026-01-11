# prevIA Admin v1 (frontend)

Minimal, technical Admin UI to explore:
- Dashboard KPIs
- Matchup Lab (team global selects, fixture-based or what-if)
- Team Explorer
- Artifacts leaderboard
- Model Runs / Metrics

This is intentionally minimal and gray-themed. It is designed to be wired to your backend endpoints later.
Right now it uses a small mocked API layer (`src/api/client.ts`) that you can swap to real fetch calls.

## Requirements
- Node.js 18+ (recommended 20+)

## Install & run
```bash
npm install
npm run dev
```

## Configure backend (later)
Edit:
- `src/config.ts` (API base URL)
- `src/api/client.ts` (replace mock functions with `fetch(...)`)

## Expected endpoints (contract)
See `src/api/contracts.ts`.

## Notes
- Season is **auto** by default (inferred from fixture or reference date).
- Team selects are **global** (no league pre-filter required).
- League/country filters can be added later without changing the core contract.
