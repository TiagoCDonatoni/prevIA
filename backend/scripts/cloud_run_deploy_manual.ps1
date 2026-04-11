Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Env([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Variavel de ambiente obrigatoria ausente: $Name"
    }
    return $value
}

$projectId = Require-Env "GCP_PROJECT_ID"
$region = Require-Env "GCP_REGION"
$service = Require-Env "CLOUD_RUN_SERVICE"
$cloudSqlConnection = Require-Env "CLOUD_SQL_CONNECTION_NAME"

$databaseUrlSecret = Require-Env "DATABASE_URL_SECRET"
$apiFootballKeySecret = Require-Env "APIFOOTBALL_KEY_SECRET"
$theOddsApiKeySecret = Require-Env "THE_ODDS_API_KEY_SECRET"
$opsTriggerTokenSecret = Require-Env "OPS_TRIGGER_TOKEN_SECRET"

Write-Host "==> Enabling required Google Cloud services..."
& gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    secretmanager.googleapis.com `
    sqladmin.googleapis.com `
    --project $projectId

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao habilitar servicos do Google Cloud."
}

Write-Host "==> Deploying Cloud Run service..."
& gcloud run deploy $service `
    --project $projectId `
    --region $region `
    --platform managed `
    --source . `
    --allow-unauthenticated `
    --port 8080 `
    --cpu 1 `
    --memory 1Gi `
    --timeout 3600 `
    --concurrency 1 `
    --min-instances 0 `
    --max-instances 1 `
    --add-cloudsql-instances $cloudSqlConnection `
    --env-vars-file cloudrun.env.yaml `
    --set-secrets DATABASE_URL="$databaseUrlSecret`:latest" `
    --set-secrets APIFOOTBALL_KEY="$apiFootballKeySecret`:latest" `
    --set-secrets THE_ODDS_API_KEY="$theOddsApiKeySecret`:latest" `
    --set-secrets OPS_TRIGGER_TOKEN="$opsTriggerTokenSecret`:latest" `
    --quiet

if ($LASTEXITCODE -ne 0) {
    throw "Falha no deploy do Cloud Run."
}

$serviceUrl = & gcloud run services describe $service `
    --project $projectId `
    --region $region `
    --format "value(status.url)"

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao ler a URL do servico Cloud Run."
}

Write-Host ""
Write-Host "OK: Cloud Run deployed"
Write-Host "SERVICE_URL=$serviceUrl"