Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Env([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Variavel de ambiente obrigatoria ausente: $Name"
    }
    return $value
}

$serviceUrl = (Require-Env "SERVICE_URL").TrimEnd('/')

$response = Invoke-RestMethod `
    -Method Get `
    -Uri "$serviceUrl/health"

$response | ConvertTo-Json -Depth 20