param(
    [string]$ProjectId = $env:GCP_PROJECT_ID,
    [string]$SecretName = $env:OPS_TRIGGER_TOKEN_SECRET,
    [string]$Token = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
    throw "GCP_PROJECT_ID ausente."
}

if ([string]::IsNullOrWhiteSpace($SecretName)) {
    $SecretName = "OPS_TRIGGER_TOKEN"
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".ToCharArray()
    $Token = -join (1..72 | ForEach-Object { $chars | Get-Random })
}

$tmp = New-TemporaryFile

try {
    Set-Content -Path $tmp.FullName -Value $Token -NoNewline -Encoding ascii

    Write-Host "==> Verificando secret: $SecretName"

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    & gcloud secrets describe $SecretName `
        --project $ProjectId `
        --format "value(name)" *> $null

    $describeExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference

    if ($describeExitCode -eq 0) {
        Write-Host "==> Secret ja existe. Adicionando nova versao: $SecretName"

        & gcloud secrets versions add $SecretName `
            --project $ProjectId `
            --data-file $tmp.FullName

        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao adicionar nova versao do secret $SecretName."
        }
    } else {
        Write-Host "==> Secret nao existe. Criando secret: $SecretName"

        & gcloud secrets create $SecretName `
            --project $ProjectId `
            --replication-policy automatic `
            --data-file $tmp.FullName

        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao criar secret $SecretName."
        }
    }

    Write-Host ""
    Write-Host "OK: secret pronto."
    Write-Host "SecretName=$SecretName"
    Write-Host ""
    Write-Host "Importante: o token nao foi impresso por seguranca."
    Write-Host "Depois de criar/rotacionar esse secret, faca novo deploy ou force nova revisao do Cloud Run."
} finally {
    $ErrorActionPreference = 'SilentlyContinue'
    Remove-Item $tmp.FullName -Force
}