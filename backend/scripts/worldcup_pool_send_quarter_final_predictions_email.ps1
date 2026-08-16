param(
    [switch]$Send
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Env([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Variavel de ambiente obrigatoria ausente: $Name"
    }
    return $value
}

# Reaproveita o gatilho manual já existente do sistema.
# Por padrão roda em dry_run.
# Para enviar de verdade:
# powershell -ExecutionPolicy Bypass -File scripts\worldcup_pool_send_quarter_final_predictions_email.ps1 -Send

$serviceUrl = Require-Env "SERVICE_URL"
$opsTriggerToken = Require-Env "OPS_TRIGGER_TOKEN"

$dryRun = -not $Send

$env:SERVICE_URL = $serviceUrl
$env:OPS_TRIGGER_TOKEN = $opsTriggerToken
$env:JOB_KEY = "worldcup_pool_predictions_open_email"
$env:REQUESTED_BY = if ($dryRun) {
    "manual_quarter_final_predictions_email_dry_run"
} else {
    "manual_quarter_final_predictions_email_send"
}
$env:TRIGGER_SOURCE = "manual"
$env:JOB_KWARGS_JSON = "{}"

$dryRunJson = if ($dryRun) { "true" } else { "false" }

$env:PAYLOAD_JSON = @"
{
  "competition_key": "fifa_world_cup_2026",
  "phase": "quarter_final",
  "notification_key": "fifa_world_cup_2026:quarter_final:predictions_open:v1",
  "dry_run": $dryRunJson,
  "force": false,
  "limit": 1000,
  "stage_label_pt": "as quartas de final",
  "stage_label_en": "the quarter-finals",
  "stage_label_es": "los cuartos de final"
}
"@

powershell -ExecutionPolicy Bypass -File scripts\cloud_run_trigger_job.ps1