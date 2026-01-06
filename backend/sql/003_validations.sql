-- backend/sql/003_validations.sql

-- 1) Fixtures sem league existente (em teoria FK impede)
select f.fixture_id
from core.fixtures f
left join core.leagues l on l.league_id = f.league_id
where l.league_id is null;

-- 2) Fixtures com times faltando (em teoria FK impede)
select f.fixture_id
from core.fixtures f
left join core.teams th on th.team_id = f.home_team_id
left join core.teams ta on ta.team_id = f.away_team_id
where th.team_id is null or ta.team_id is null;

-- 3) Duplicidade lógica (alerta)
select
  home_team_id, away_team_id, date_trunc('hour', kickoff_utc) as kickoff_hour,
  count(*) as n
from core.fixtures
group by 1,2,3
having count(*) > 1
order by n desc;

-- 4) Datas suspeitas (alerta: parse/timezone)
select fixture_id, kickoff_utc
from core.fixtures
where kickoff_utc > now() + interval '365 days'
order by kickoff_utc desc;

-- 5) finished sem placar (alerta)
select fixture_id, status_short, goals_home, goals_away
from core.fixtures
where is_finished = true and (goals_home is null or goals_away is null);
