Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Value([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Valor obrigatorio ausente: $Name"
    }
    return $Value
}

function Env-OrDefault([string]$Name, [string]$Default) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
    }
    return $value
}

$projectId = Require-Value "GCP_PROJECT_ID" $env:GCP_PROJECT_ID
$region = Require-Value "GCP_REGION" $env:GCP_REGION
$service = Require-Value "CLOUD_RUN_SERVICE" $env:CLOUD_RUN_SERVICE
$opsTriggerTokenSecret = Env-OrDefault "OPS_TRIGGER_TOKEN_SECRET" "OPS_TRIGGER_TOKEN"

$timeZone = Env-OrDefault "CLOUD_SCHEDULER_TIME_ZONE" "America/Sao_Paulo"
$jobPrefix = Env-OrDefault "CLOUD_SCHEDULER_JOB_PREFIX" "previa-ops"
$schedulerServiceAccountName = Env-OrDefault "CLOUD_SCHEDULER_SERVICE_ACCOUNT_NAME" "previa-ops-scheduler"
$schedulerServiceAccountEmail = Env-OrDefault `
    "CLOUD_SCHEDULER_SERVICE_ACCOUNT_EMAIL" `
    "$schedulerServiceAccountName@$projectId.iam.gserviceaccount.com"

Write-Host "==> Enabling required APIs..."
& gcloud services enable `
    cloudscheduler.googleapis.com `
    iam.googleapis.com `
    run.googleapis.com `
    secretmanager.googleapis.com `
    --project $projectId

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao habilitar APIs necessarias."
}

Write-Host "==> Resolving Cloud Run URL..."
$serviceUrl = & gcloud run services describe $service `
    --project $projectId `
    --region $region `
    --format "value(status.url)"

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($serviceUrl)) {
    throw "Falha ao resolver URL do Cloud Run service."
}

$serviceUrl = $serviceUrl.TrimEnd("/")
$targetUri = "$serviceUrl/internal/ops/jobs/run"

Write-Host "==> Reading OPS trigger token from Secret Manager..."
$opsTriggerToken = & gcloud secrets versions access latest `
    --secret $opsTriggerTokenSecret `
    --project $projectId

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($opsTriggerToken)) {
    throw "Falha ao ler secret $opsTriggerTokenSecret."
}

$opsTriggerToken = $opsTriggerToken.Trim().Trim([char]0xFEFF)

Write-Host "==> Ensuring Scheduler service account..."

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

& gcloud iam service-accounts describe $schedulerServiceAccountEmail `
    --project $projectId *> $null

$serviceAccountDescribeExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

if ($serviceAccountDescribeExitCode -ne 0) {
    Write-Host "==> Service account nao existe. Criando: $schedulerServiceAccountEmail"

    & gcloud iam service-accounts create $schedulerServiceAccountName `
        --project $projectId `
        --display-name "prevIA Ops Scheduler"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar service account $schedulerServiceAccountName."
    }
} else {
    Write-Host "==> Service account ja existe: $schedulerServiceAccountEmail"
}

Write-Host "==> Granting Cloud Run Invoker to Scheduler service account..."
& gcloud run services add-iam-policy-binding $service `
    --project $projectId `
    --region $region `
    --member "serviceAccount:$schedulerServiceAccountEmail" `
    --role "roles/run.invoker" `
    --quiet

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao conceder roles/run.invoker ao Scheduler service account."
}

$activeAccount = (& gcloud config get-value account --quiet).Trim()
if (-not [string]::IsNullOrWhiteSpace($activeAccount)) {
    if ($activeAccount.EndsWith(".gserviceaccount.com")) {
        $activeMember = "serviceAccount:$activeAccount"
    } else {
        $activeMember = "user:$activeAccount"
    }

    Write-Host "==> Granting iam.serviceAccountUser to active gcloud account when possible..."

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    & gcloud iam service-accounts add-iam-policy-binding $schedulerServiceAccountEmail `
        --project $projectId `
        --member $activeMember `
        --role "roles/iam.serviceAccountUser" `
        --quiet *> $null

    $serviceAccountUserGrantExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference

    if ($serviceAccountUserGrantExitCode -ne 0) {
        Write-Host "Aviso: nao consegui conceder roles/iam.serviceAccountUser automaticamente."
        Write-Host "Se o create/update do Scheduler falhar com iam.serviceAccounts.actAs, conceda manualmente:"
        Write-Host "gcloud iam service-accounts add-iam-policy-binding $schedulerServiceAccountEmail --project $projectId --member $activeMember --role roles/iam.serviceAccountUser"
    } else {
        Write-Host "==> iam.serviceAccountUser OK para $activeMember"
    }
}

$jobs = @(
    @{
        id = "$jobPrefix-pipeline-run-all"
        schedule = "25 */6 * * *"
        job_key = "pipeline_run_all"
        requested_by = "cloud_scheduler_pipeline_run_all"
        attempt_deadline = "1800s"
        description = "prevIA: odds refresh + resolve + snapshots a cada 6h"
        job_kwargs = @{}
        payload = @{}
    },
    @{
        id = "$jobPrefix-audit-sync"
        schedule = "45 5 * * *"
        job_key = "audit_sync_from_product_snapshots"
        requested_by = "cloud_scheduler_audit_sync"
        attempt_deadline = "900s"
        description = "prevIA: sync diario de audit predictions/results"
        job_kwargs = @{
            lookback_days = 14
            finished_before_hours = 1
            max_prediction_rows = 10000
            max_result_rows = 10000
        }
        payload = @{}
    },
    @{
        id = "$jobPrefix-odds-catalog-sync"
        schedule = "5 3 * * 1"
        job_key = "odds_catalog_sync"
        requested_by = "cloud_scheduler_odds_catalog_sync"
        attempt_deadline = "900s"
        description = "prevIA: sync semanal do catalogo The Odds API"
        job_kwargs = @{
            all_sports = $true
        }
        payload = @{}
    },
    @{
        id = "$jobPrefix-odds-league-gap-scan"
        schedule = "15 3 * * 1"
        job_key = "odds_league_gap_scan"
        requested_by = "cloud_scheduler_odds_league_gap_scan"
        attempt_deadline = "900s"
        description = "prevIA: scan semanal de gaps do mapa de ligas"
        job_kwargs = @{}
        payload = @{}
    },
    @{
        id = "$jobPrefix-odds-league-autoclassify"
        schedule = "30 3 * * 1"
        job_key = "odds_league_autoclassify"
        requested_by = "cloud_scheduler_odds_league_autoclassify"
        attempt_deadline = "900s"
        description = "prevIA: autoclassificacao semanal de ligas"
        job_kwargs = @{}
        payload = @{}
    }
)

$updatePipelineShardSchedules = @(
    "5 1 * * 2,4,6",
    "20 1 * * 2,4,6",
    "35 1 * * 2,4,6",
    "50 1 * * 2,4,6",
    "5 2 * * 2,4,6",
    "20 2 * * 2,4,6",
    "35 2 * * 2,4,6",
    "50 2 * * 2,4,6",
    "5 3 * * 2,4,6",
    "20 3 * * 2,4,6"
)

for ($i = 0; $i -lt 10; $i++) {
    $suffix = "{0:D2}" -f $i

    $jobs += @{
        id = "$jobPrefix-update-pipeline-shard-$suffix"
        schedule = $updatePipelineShardSchedules[$i]
        job_key = "update_pipeline_run_shard"
        requested_by = "cloud_scheduler_update_pipeline_shard_$suffix"
        attempt_deadline = "1800s"
        description = "prevIA: update pipeline pesado shard $suffix/10"
        job_kwargs = @{
            shard_index = $i
            shard_count = 10
            max_scopes = 5
        }
        payload = @{}
    }
}

function Apply-SchedulerJob($Job) {
    $body = @{
        job_key = $Job.job_key
        trigger_source = "scheduler"
        requested_by = $Job.requested_by
        job_kwargs = $Job.job_kwargs
        payload = $Job.payload
    } | ConvertTo-Json -Depth 20

    $bodyFile = New-TemporaryFile

    try {
        Set-Content -Path $bodyFile.FullName -Value $body -NoNewline -Encoding ascii

        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'

        & gcloud scheduler jobs describe $Job.id `
            --project $projectId `
            --location $region *> $null

        $schedulerJobDescribeExitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorActionPreference

        if ($schedulerJobDescribeExitCode -eq 0) {
            Write-Host "==> Scheduler job ja existe. Recriando para atualizar config/token: $($Job.id)"

            $previousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'

            & gcloud scheduler jobs delete $Job.id `
                --project $projectId `
                --location $region `
                --quiet *> $null

            $deleteExitCode = $LASTEXITCODE
            $ErrorActionPreference = $previousErrorActionPreference

            if ($deleteExitCode -ne 0) {
                throw "Falha ao deletar Scheduler job existente $($Job.id)."
            }
        } else {
            Write-Host "==> Creating Scheduler job: $($Job.id)"
        }

        $headers = "Content-Type=application/json,X-Ops-Trigger-Token=$opsTriggerToken"

        & gcloud scheduler jobs create http $Job.id `
            --project $projectId `
            --location $region `
            --schedule $Job.schedule `
            --time-zone $timeZone `
            --uri $targetUri `
            --http-method POST `
            --headers $headers `
            --message-body-from-file $bodyFile.FullName `
            --attempt-deadline $Job.attempt_deadline `
            --max-retry-attempts 0 `
            --oidc-service-account-email $schedulerServiceAccountEmail `
            --oidc-token-audience $serviceUrl `
            --description $Job.description `
            --quiet *> $null

        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao criar Scheduler job $($Job.id)."
        }
    } finally {
        Remove-Item $bodyFile.FullName -Force -ErrorAction SilentlyContinue
    }
}

foreach ($job in $jobs) {
    Apply-SchedulerJob $job
}

Write-Host ""
Write-Host "OK: Cloud Scheduler jobs aplicados."
Write-Host "TargetUri=$targetUri"
Write-Host "TimeZone=$timeZone"
Write-Host ""
Write-Host "Jobs criados/atualizados:"
foreach ($job in $jobs) {
    Write-Host " - $($job.id): $($job.schedule) -> $($job.job_key)"
}

Write-Host ""
Write-Host "update_pipeline_run monolitico NAO foi agendado por risco de timeout >30min no HTTP target."
Write-Host "update_pipeline_run_shard foi agendado em 10 shards terça/quinta/sábado entre 01:05 e 03:20."