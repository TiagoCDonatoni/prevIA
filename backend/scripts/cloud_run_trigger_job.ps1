Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Env([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Variavel de ambiente obrigatoria ausente: $Name"
    }
    return $value
}

function Read-JsonEnv([string]$Name) {
    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return @{}
    }

    $parsed = $raw | ConvertFrom-Json
    if ($null -eq $parsed) {
        return @{}
    }
    return $parsed
}

$serviceUrl = (Require-Env "SERVICE_URL").TrimEnd('/')
$opsTriggerToken = Require-Env "OPS_TRIGGER_TOKEN"
$jobKey = Require-Env "JOB_KEY"

$requestedBy = [Environment]::GetEnvironmentVariable("REQUESTED_BY")
if ([string]::IsNullOrWhiteSpace($requestedBy)) {
    $requestedBy = "manual_cloud"
}

$jobKwargs = Read-JsonEnv "JOB_KWARGS_JSON"
$payload = Read-JsonEnv "PAYLOAD_JSON"

$body = @{
    job_key = $jobKey
    requested_by = $requestedBy
    job_kwargs = $jobKwargs
    payload = $payload
}

$correlationId = [Environment]::GetEnvironmentVariable("CORRELATION_ID")
if (-not [string]::IsNullOrWhiteSpace($correlationId)) {
    $body["correlation_id"] = $correlationId
}

$idempotencyKey = [Environment]::GetEnvironmentVariable("IDEMPOTENCY_KEY")
if (-not [string]::IsNullOrWhiteSpace($idempotencyKey)) {
    $body["idempotency_key"] = $idempotencyKey
}

$jsonBody = $body | ConvertTo-Json -Depth 20

$response = Invoke-RestMethod `
    -Method Post `
    -Uri "$serviceUrl/internal/ops/jobs/run" `
    -Headers @{ "X-Ops-Trigger-Token" = $opsTriggerToken } `
    -ContentType "application/json" `
    -Body $jsonBody

$response | ConvertTo-Json -Depth 20