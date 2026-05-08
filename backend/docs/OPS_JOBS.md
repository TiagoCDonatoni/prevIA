# prevIA — Ops / Jobs / Cloud

Este documento descreve a camada operacional de jobs do prevIA: o que cada job faz, como é executado, quais tabelas registra, quais rotinas estão agendadas no Google Cloud e como operar manualmente em caso de manutenção.

---

## 1. Visão geral

A camada Ops/Jobs/Cloud tem quatro objetivos principais:

1. Manter o app atualizado com odds, partidas resolvidas e snapshots.
2. Atualizar periodicamente a base pesada de fixtures, estatísticas, modelos e auditoria.
3. Registrar todas as execuções de forma auditável.
4. Permitir bloqueio temporário de jobs via feature flags operacionais.

Arquitetura atual:

```txt
Cloud Scheduler
  ↓
Cloud Run /internal/ops/jobs/run
  ↓
X-Ops-Trigger-Token
  ↓
run_job(...)
  ↓
job_dispatcher
  ↓
job específico
  ↓
ops.ops_job_runs / attempts / events
2. Tabelas operacionais

As tabelas ficam no schema ops.

ops.ops_job_definitions

Catálogo dos jobs conhecidos pelo backend.

Contém:

job_key
display_name
handler_name
enabled_by_default
allow_manual_run
allow_scheduler_run
default_timeout_sec
default_max_attempts
default_payload_json
tags_json
ops.ops_job_runs

Uma execução lógica de um job.

Registra:

job executado
origem (manual, api, scheduler)
solicitante
status
payload efetivo
counters resumidos
resultado completo
erro estruturado
início/fim/duração

Status possíveis:

queued
running
succeeded
failed
blocked
cancelled
ops.ops_job_attempts

Tentativas concretas de execução de um run.

Um run bloqueado por flag não cria attempt.

ops.ops_job_events

Eventos auditáveis do run.

Exemplos:

queued
started
succeeded
failed
blocked
ops.ops_job_scope_overrides

Overrides operacionais por escopo.

Hoje usado para metadados como:

prioridade
timeout
cron pretendido
timezone
payload patch
notas operacionais
ops.ops_feature_flags

Flags temporárias para ligar/desligar jobs.

Escopos suportados:

global
job
sport_key
job_sport_key

Precedência:

job_sport_key > job > sport_key > global
3. Jobs principais
pipeline_run_all
Função

Job leve e frequente do produto.

Mantém o app atualizado com odds novas, resolução de jogos e snapshots.

Fluxo interno
odds_refresh
→ odds_resolve_batch
→ models_ensure_1x2_v1
→ snapshots_materialize
Em termos de produto

É o job que mantém os cards/análises do app vivos ao longo do dia.

Frequência atual
Todos os dias
00:25, 06:25, 12:25, 18:25
Timezone: America/Sao_Paulo
Scheduler
previa-ops-pipeline-run-all
Observação

Já validado em produção com 50 ligas, failed_count = 0, em aproximadamente 3 minutos.

odds_refresh
Função

Busca odds novas no provider de odds.

O que faz
Consulta eventos/odds por sport_key.
Atualiza odds.odds_events.
Persiste snapshots de odds.
Persiste market snapshots quando disponíveis.
Frequência

Não está agendado diretamente.

É chamado por:

pipeline_run_all
update_pipeline_run
update_pipeline_run_shard
odds_resolve_batch
Função

Liga eventos da Odds API às partidas internas do prevIA.

O que faz
Lê eventos de odds.
Procura correspondência em core.fixtures.
Usa times, liga, horário e tolerância.
Classifica como resolvido, provável, ambíguo ou não encontrado.
Frequência

Não está agendado diretamente.

É chamado por:

pipeline_run_all
update_pipeline_run
update_pipeline_run_shard
models_ensure_1x2_v1
Função

Garante que existe modelo 1x2 disponível para a liga.

O que faz
Verifica artifact/modelo existente.
Pula se o artifact estiver válido.
Cria/treina quando necessário.
Frequência

Não está agendado diretamente.

É chamado por:

pipeline_run_all
update_pipeline_run
update_pipeline_run_shard
snapshots_materialize
Função

Materializa snapshots prontos para o frontend.

O que faz

Combina:

fixture
odds
estatísticas
modelo
probabilidades
fair odds
edge
payload JSON

E grava em:

product.matchup_snapshot_v1
Frequência

Não está agendado diretamente.

É chamado por:

pipeline_run_all
update_pipeline_run
update_pipeline_run_shard
audit_sync_from_product_snapshots
Função

Alimenta a camada de auditoria do modelo.

O que faz
Lê snapshots do produto.
Extrai predições.
Busca resultados de jogos finalizados.
Atualiza auditoria de predictions/results.
Frequência atual
Todos os dias
05:45
Timezone: America/Sao_Paulo
Scheduler
previa-ops-audit-sync
Uso

Permite medir:

calibração
acurácia histórica
Brier Score
Log Loss
performance por liga/mercado
outliers do modelo
update_pipeline_run
Função

Job pesado monolítico.

O que faz

Atualiza profundamente:

fixtures
times
ligas
estatísticas
odds
resolução de odds
modelos
snapshots
auditoria
Status atual

Existe e pode ser executado manualmente, mas não está agendado.

Motivo

Runs anteriores levaram cerca de 33–36 minutos, o que é arriscado para Cloud Scheduler HTTP.

Por isso, o Scheduler usa update_pipeline_run_shard.

update_pipeline_run_shard
Função

Versão shardeada e cloud-safe do update_pipeline_run.

O que faz

Divide as ligas approved/enabled em shards.

Exemplo:

50 ligas
10 shards
5 ligas por shard

Cada shard executa o update pesado apenas para seu subconjunto.

Frequência atual
terça, quinta e sábado
01:05 até 03:20
10 shards
15 minutos de intervalo
Timezone: America/Sao_Paulo
Schedulers
previa-ops-update-pipeline-shard-00
previa-ops-update-pipeline-shard-01
previa-ops-update-pipeline-shard-02
previa-ops-update-pipeline-shard-03
previa-ops-update-pipeline-shard-04
previa-ops-update-pipeline-shard-05
previa-ops-update-pipeline-shard-06
previa-ops-update-pipeline-shard-07
previa-ops-update-pipeline-shard-08
previa-ops-update-pipeline-shard-09
Horários
01:05 shard 00
01:20 shard 01
01:35 shard 02
01:50 shard 03
02:05 shard 04
02:20 shard 05
02:35 shard 06
02:50 shard 07
03:05 shard 08
03:20 shard 09
Status

Validado em produção via Scheduler:

count = 5
succeeded_count = 5
failed_count = 0
duration ≈ 43s
odds_catalog_sync
Função

Sincroniza catálogo de esportes/ligas da Odds API.

O que faz
Consulta catálogo externo.
Atualiza odds.odds_sport_catalog.
Registra sport_keys disponíveis.
Frequência atual
Segunda-feira
03:05
Timezone: America/Sao_Paulo
Scheduler
previa-ops-odds-catalog-sync
odds_league_gap_scan
Função

Detecta lacunas entre catálogo externo e mapa interno.

O que faz

Compara:

odds.odds_sport_catalog
odds.odds_league_map

E identifica ligas:

novas
ausentes
pendentes de mapeamento
candidatas a aprovação
Frequência atual
Segunda-feira
03:15
Timezone: America/Sao_Paulo
Scheduler
previa-ops-odds-league-gap-scan
odds_league_autoclassify
Função

Tenta classificar automaticamente sugestões de ligas.

O que faz
Analisa sugestões pendentes.
Aplica regras conservadoras.
Pode marcar ligas como candidatas, ignoráveis ou mapeáveis.
Frequência atual
Segunda-feira
03:30
Timezone: America/Sao_Paulo
Scheduler
previa-ops-odds-league-autoclassify
Observação

Deve permanecer conservador. Melhor deixar uma liga pendente do que mapear errado.

oddspapi_run_controlled_enrichment
Função

Enriquecimento controlado usando Oddspapi.

Status atual
Desligado
Não agendado
Manual
Motivo

Envolve custo e cap mensal.

Uso futuro possível
Times fora de ligas principais.
Jogos com baixa cobertura.
Análises manuais com dados insuficientes.
Outliers detectados pelo modelo.
4. Agenda atual consolidada
Todos os dias
00:25 pipeline_run_all
05:45 audit_sync_from_product_snapshots
06:25 pipeline_run_all
12:25 pipeline_run_all
18:25 pipeline_run_all
Segunda-feira
03:05 odds_catalog_sync
03:15 odds_league_gap_scan
03:30 odds_league_autoclassify
Terça, quinta e sábado
01:05 update_pipeline_run_shard 00
01:20 update_pipeline_run_shard 01
01:35 update_pipeline_run_shard 02
01:50 update_pipeline_run_shard 03
02:05 update_pipeline_run_shard 04
02:20 update_pipeline_run_shard 05
02:35 update_pipeline_run_shard 06
02:50 update_pipeline_run_shard 07
03:05 update_pipeline_run_shard 08
03:20 update_pipeline_run_shard 09
5. Como criar/atualizar os schedulers

Dentro de backend:

powershell -ExecutionPolicy Bypass -File scripts\cloud_scheduler_apply_ops_jobs.ps1 `
  -ProjectId previa-prod `
  -Region southamerica-east1 `
  -Service previa-api `
  -OpsTriggerTokenSecret previa-ops-trigger-token

Esse script recria/atualiza:

jobs frequentes
jobs semanais
shards do update pesado
6. Como rotacionar o token operacional
powershell -ExecutionPolicy Bypass -File scripts\cloud_ops_create_trigger_secret.ps1 `
  -ProjectId previa-prod `
  -SecretName previa-ops-trigger-token

Depois de rotacionar, é necessário:

Fazer redeploy do Cloud Run.
Reaplicar os Scheduler jobs.
7. Deploy Cloud Run
$env:GCP_PROJECT_ID="previa-prod"
$env:GCP_REGION="southamerica-east1"
$env:CLOUD_RUN_SERVICE="previa-api"
$env:CLOUD_SQL_CONNECTION_NAME="previa-prod:southamerica-east1:previa-dev-pg"

$env:DATABASE_URL_SECRET="previa-database-url"
$env:APIFOOTBALL_KEY_SECRET="previa-apifootball-key"
$env:THE_ODDS_API_KEY_SECRET="previa-theodds-key"
$env:OPS_TRIGGER_TOKEN_SECRET="previa-ops-trigger-token"

powershell -ExecutionPolicy Bypass -File scripts\cloud_run_deploy_manual.ps1
8. Como rodar um job manualmente
Exemplo: audit sync
$serviceUrl = "https://previa-api-zieefwzcma-rj.a.run.app"

$opsTriggerToken = gcloud secrets versions access latest `
  --secret previa-ops-trigger-token `
  --project previa-prod

$body = @{
  job_key = "audit_sync_from_product_snapshots"
  trigger_source = "manual"
  requested_by = "manual_cloud_audit_test"
  job_kwargs = @{
    lookback_days = 14
    finished_before_hours = 1
    max_prediction_rows = 10000
    max_result_rows = 10000
  }
  payload = @{}
} | ConvertTo-Json -Depth 20

Invoke-RestMethod `
  -Method POST `
  -Uri "$serviceUrl/internal/ops/jobs/run" `
  -Headers @{
    "X-Ops-Trigger-Token" = $opsTriggerToken.Trim()
  } `
  -ContentType "application/json" `
  -Body $body
Exemplo: pipeline para uma liga
$serviceUrl = "https://previa-api-zieefwzcma-rj.a.run.app"

$opsTriggerToken = gcloud secrets versions access latest `
  --secret previa-ops-trigger-token `
  --project previa-prod

$body = @{
  job_key = "pipeline_run_all"
  trigger_source = "manual"
  requested_by = "manual_cloud_pipeline_single_sport"
  job_kwargs = @{
    only_sport_key = "soccer_brazil_campeonato"
  }
  payload = @{}
} | ConvertTo-Json -Depth 20

Invoke-RestMethod `
  -Method POST `
  -Uri "$serviceUrl/internal/ops/jobs/run" `
  -Headers @{
    "X-Ops-Trigger-Token" = $opsTriggerToken.Trim()
  } `
  -ContentType "application/json" `
  -Body $body
Exemplo: shard pesado com limite
$serviceUrl = "https://previa-api-zieefwzcma-rj.a.run.app"

$opsTriggerToken = gcloud secrets versions access latest `
  --secret previa-ops-trigger-token `
  --project previa-prod

$body = @{
  job_key = "update_pipeline_run_shard"
  trigger_source = "manual"
  requested_by = "manual_cloud_update_pipeline_shard_smoke_test"
  job_kwargs = @{
    shard_index = 0
    shard_count = 10
    max_scopes = 1
  }
  payload = @{}
} | ConvertTo-Json -Depth 20

Invoke-RestMethod `
  -Method POST `
  -Uri "$serviceUrl/internal/ops/jobs/run" `
  -Headers @{
    "X-Ops-Trigger-Token" = $opsTriggerToken.Trim()
  } `
  -ContentType "application/json" `
  -Body $body
9. Como rodar um Scheduler manualmente
Audit
gcloud scheduler jobs run previa-ops-audit-sync `
  --project previa-prod `
  --location southamerica-east1
Pipeline 6h
gcloud scheduler jobs run previa-ops-pipeline-run-all `
  --project previa-prod `
  --location southamerica-east1
Shard pesado
gcloud scheduler jobs run previa-ops-update-pipeline-shard-00 `
  --project previa-prod `
  --location southamerica-east1
10. Consultas úteis
Últimos runs
SELECT
  run_id,
  job_key,
  trigger_source,
  requested_by,
  status,
  started_at_utc,
  finished_at_utc,
  duration_ms,
  counters_json,
  error_json
FROM ops.ops_job_runs
ORDER BY run_id DESC
LIMIT 20;
Resumo do pipeline 6h
SELECT
  run_id,
  status,
  counters_json->>'count' AS count,
  counters_json->>'succeeded_count' AS succeeded_count,
  counters_json->>'failed_count' AS failed_count,
  duration_ms,
  error_json
FROM ops.ops_job_runs
WHERE job_key = 'pipeline_run_all'
ORDER BY run_id DESC
LIMIT 10;
Resumo dos shards pesados
SELECT
  run_id,
  requested_by,
  status,
  counters_json->>'shard_index' AS shard_index,
  counters_json->>'shard_count' AS shard_count,
  counters_json->>'count' AS count,
  counters_json->>'succeeded_count' AS succeeded_count,
  counters_json->>'failed_count' AS failed_count,
  duration_ms,
  error_json
FROM ops.ops_job_runs
WHERE job_key = 'update_pipeline_run_shard'
ORDER BY run_id DESC
LIMIT 20;
Ver ligas com falha em um pipeline
SELECT
  item->>'sport_key' AS sport_key,
  item->>'league_id' AS league_id,
  item->>'ok' AS ok,
  item->'exception' AS exception,
  item->'warnings' AS warnings,
  item->'summary' AS summary
FROM ops.ops_job_runs r
CROSS JOIN LATERAL jsonb_array_elements(r.result_json->'items') AS item
WHERE r.run_id = :run_id
  AND COALESCE((item->>'ok')::boolean, true) = false;

Substitua :run_id pelo run desejado.

Eventos de um run
SELECT
  event_id,
  event_type,
  event_level,
  message,
  created_at_utc,
  payload_json
FROM ops.ops_job_events
WHERE run_id = :run_id
ORDER BY event_id ASC;
Attempts de um run
SELECT
  attempt_id,
  run_id,
  attempt_no,
  status,
  started_at_utc,
  finished_at_utc,
  duration_ms,
  counters_json,
  error_json
FROM ops.ops_job_attempts
WHERE run_id = :run_id
ORDER BY attempt_no ASC;
11. Feature flags operacionais
Bloquear todos os jobs por 2 horas
INSERT INTO ops.ops_feature_flags (
  flag_name,
  scope_type,
  enabled,
  reason,
  expires_at_utc,
  created_by
)
VALUES (
  'enabled',
  'global',
  FALSE,
  'maintenance window',
  now() + interval '2 hours',
  'admin'
);
Bloquear um job específico
INSERT INTO ops.ops_feature_flags (
  flag_name,
  scope_type,
  job_key,
  enabled,
  reason,
  expires_at_utc,
  created_by
)
VALUES (
  'enabled',
  'job',
  'pipeline_run_all',
  FALSE,
  'pausar pipeline temporariamente',
  now() + interval '6 hours',
  'admin'
);
Bloquear um sport_key
INSERT INTO ops.ops_feature_flags (
  flag_name,
  scope_type,
  sport_key,
  enabled,
  reason,
  expires_at_utc,
  created_by
)
VALUES (
  'enabled',
  'sport_key',
  'soccer_brazil_campeonato',
  FALSE,
  'pausar liga durante investigacao',
  now() + interval '12 hours',
  'admin'
);
Encerrar uma flag manualmente
UPDATE ops.ops_feature_flags
SET expires_at_utc = now()
WHERE reason = 'maintenance window'
  AND expires_at_utc > now();
12. Operação de emergência
Pausar Scheduler do pipeline
gcloud scheduler jobs pause previa-ops-pipeline-run-all `
  --project previa-prod `
  --location southamerica-east1
Reativar Scheduler do pipeline
gcloud scheduler jobs resume previa-ops-pipeline-run-all `
  --project previa-prod `
  --location southamerica-east1
Pausar um shard pesado
gcloud scheduler jobs pause previa-ops-update-pipeline-shard-00 `
  --project previa-prod `
  --location southamerica-east1
Reativar um shard pesado
gcloud scheduler jobs resume previa-ops-update-pipeline-shard-00 `
  --project previa-prod `
  --location southamerica-east1
13. Logs Cloud Run
gcloud run services logs read previa-api `
  --project previa-prod `
  --region southamerica-east1 `
  --limit 120

Buscar por:

/internal/ops/jobs/run
pipeline_run_all
update_pipeline_run_shard
audit_sync_from_product_snapshots
401
403
500
14. Troubleshooting
401 ou 403

Possíveis causas:

token incorreto
secret rotacionado sem redeploy
scheduler com token antigo
service account sem roles/run.invoker

Ações:

Rotacionar secret.
Fazer redeploy do Cloud Run.
Reaplicar Scheduler jobs.
Verificar IAM do serviço Cloud Run.
JOB_NOT_FOUND

Possíveis causas:

job_dispatcher.py ainda não tem o job.
Cloud Run está em revisão antiga.
Migration criou o job no banco, mas o código não foi deployado.

Ação:

python -c "from src.ops.job_dispatcher import get_job_callable; print(get_job_callable('NOME_DO_JOB'))"

Depois redeploy.

NameError: pg_conn is not defined

Causa conhecida já corrigida:

src/ops/jobs/odds_refresh.py usava pg_conn sem import.

Patch esperado:

from src.db.pg import pg_conn
Scheduler imprime token no terminal

Não deve acontecer.

O script deve suprimir output do gcloud scheduler jobs create com:

*> $null

Se o token aparecer em logs/terminal, rotacionar o secret.

Job pesado demora demais

Não agendar update_pipeline_run monolítico.

Usar:

update_pipeline_run_shard
15. Política atual
Agendado
pipeline_run_all
audit_sync_from_product_snapshots
odds_catalog_sync
odds_league_gap_scan
odds_league_autoclassify
update_pipeline_run_shard
Manual
update_pipeline_run
oddspapi_run_controlled_enrichment
odds_refresh
odds_resolve_batch
snapshots_materialize
models_ensure_1x2_v1
Desligado por padrão
oddspapi_run_controlled_enrichment

Motivo: custo/cap mensal.