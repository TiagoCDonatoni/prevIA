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

# Envia UM email único para a reta final:
# - disputa de 3º lugar
# - final
#
# Por padrão roda em dry_run.
# Para enviar de verdade:
# powershell -ExecutionPolicy Bypass -File scripts\worldcup_pool_send_final_stage_predictions_email.ps1 -Send

$serviceUrl = Require-Env "SERVICE_URL"
$opsTriggerToken = Require-Env "OPS_TRIGGER_TOKEN"

$dryRun = -not $Send

$env:SERVICE_URL = $serviceUrl
$env:OPS_TRIGGER_TOKEN = $opsTriggerToken
$env:JOB_KEY = "worldcup_pool_predictions_open_email"
$env:REQUESTED_BY = if ($dryRun) {
    "manual_final_stage_predictions_email_dry_run"
} else {
    "manual_final_stage_predictions_email_send"
}
$env:TRIGGER_SOURCE = "manual"
$env:JOB_KWARGS_JSON = "{}"

$dryRunJson = if ($dryRun) { "true" } else { "false" }

$env:PAYLOAD_JSON = @"
{
  "competition_key": "fifa_world_cup_2026",
  "phase": "final",
  "notification_key": "fifa_world_cup_2026:final_stage:predictions_open:v1",
  "dry_run": $dryRunJson,
  "force": false,
  "limit": 1000,
  "stage_label_pt": "a reta final: disputa de 3º lugar e final",
  "stage_label_en": "the final stage: third-place match and final",
  "stage_label_es": "la recta final: partido por el 3º puesto y final"
}
"@

powershell -ExecutionPolicy Bypass -File scripts\cloud_run_trigger_job.ps1