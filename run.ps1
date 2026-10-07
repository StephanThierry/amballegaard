<#
.SYNOPSIS
  Starter Amballegaard: backend (ASP.NET, port 5028) og frontend (Vite, port 5173).

.EXAMPLE
  .\run.ps1              # udvikling: backend + Vite med hot reload, åbner browseren
  .\run.ps1 -NoBrowser   # som ovenfor, men uden at åbne browseren
  .\run.ps1 -Prod        # bygger frontenden ind i wwwroot og kører kun backend (http://localhost:5028)

  Ctrl+C stopper det hele.
#>
param(
    [switch]$Prod,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$web = Join-Path $root 'web'
$serverProject = Join-Path $root 'src\Amballegaard.Server'

function Assert-PortFree([int]$port) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        throw "Port $port er allerede i brug af '$($proc.ProcessName)' (PID $($listener.OwningProcess)). Luk den først, fx: Stop-Process -Id $($listener.OwningProcess)"
    }
}

Assert-PortFree 5028
if (-not $Prod) { Assert-PortFree 5173 }

if (-not (Test-Path (Join-Path $web 'node_modules'))) {
    Write-Host 'Installerer npm-pakker (første gang)...' -ForegroundColor Cyan
    Push-Location $web
    try { npm install } finally { Pop-Location }
}

if ($Prod) {
    Write-Host 'Bygger frontend til wwwroot...' -ForegroundColor Cyan
    Push-Location $web
    try { npm run build } finally { Pop-Location }
    if (-not $NoBrowser) { Start-Process 'http://localhost:5028' }
    dotnet run --project $serverProject
    return
}

Write-Host 'Starter backend på http://localhost:5028 ...' -ForegroundColor Cyan
$api = Start-Process dotnet -ArgumentList @('run', '--project', "`"$serverProject`"") -NoNewWindow -PassThru

try {
    # Vent til API'et svarer, så frontenden ikke starter uden forbindelse.
    $deadline = (Get-Date).AddSeconds(90)
    while ($true) {
        if ($api.HasExited) { throw "Backend stoppede under opstart (exit code $($api.ExitCode))." }
        try {
            Invoke-WebRequest 'http://localhost:5028/api/state' -UseBasicParsing -TimeoutSec 2 | Out-Null
            break
        } catch {
            if ((Get-Date) -gt $deadline) { throw 'Backend svarede ikke inden for 90 sekunder.' }
            Start-Sleep -Milliseconds 500
        }
    }
    Write-Host 'Backend kører. Starter frontend på http://localhost:5173 ...' -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process 'http://localhost:5173' }

    # Vite køres direkte via node (ikke npm.cmd), så Ctrl+C ikke spørger "Terminate batch job?".
    Push-Location $web
    try { node node_modules/vite/bin/vite.js --port 5173 --strictPort }
    finally { Pop-Location }
}
finally {
    if (-not $api.HasExited) {
        Write-Host 'Stopper backend...' -ForegroundColor Cyan
        # /T stopper også den underproces, som "dotnet run" starter.
        taskkill /PID $api.Id /T /F | Out-Null
    }
}
