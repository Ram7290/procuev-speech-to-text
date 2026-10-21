# One-time setup for the self-hosted whisper.cpp STT provider (Phase 2).
# Downloads the prebuilt Windows binary (no compiler needed) + the ggml model.
# Usage:  powershell scripts/setup-whisper.ps1 [-Model small]
#         (models: tiny | base | small | medium — small is a good Hindi/English default)
param([string]$Model = "small")
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$srv  = Join-Path $root 'server'
New-Item -ItemType Directory -Force (Join-Path $srv 'models'), (Join-Path $srv 'bin') | Out-Null

# ---- 1. prebuilt binary ------------------------------------------------------
# Release v1.9.2 ships prebuilt Windows builds (newer tags only build from source).
$zipPath = Join-Path $env:TEMP 'whisper-bin-x64.zip'
if (-not (Test-Path $zipPath)) {
  Write-Host "downloading whisper.cpp prebuilt binary (~8 MB) ..."
  Invoke-WebRequest 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip' -OutFile $zipPath
}
Expand-Archive $zipPath (Join-Path $srv 'bin') -Force
if (-not (Test-Path (Join-Path $srv 'bin\Release\whisper-cli.exe'))) {
  throw "whisper-cli.exe not found after extraction"
}

# ---- 2. model ------------------------------------------------------------------
# ggml models live on HuggingFace: https://huggingface.co/ggerganov/whisper.cpp
$modelFile = Join-Path $srv "models\ggml-$Model.bin"
if (Test-Path $modelFile) {
  Write-Host "model already present: $modelFile"
} else {
  $url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$Model.bin"
  Write-Host "downloading model (~$({ tiny:78, base:148, small:488, medium:1530 }[$Model] ?? '?') MB) ..."
  Invoke-WebRequest -Uri $url -OutFile $modelFile
}

Write-Host ""
Write-Host "Done. Enable it in server/.env:"
Write-Host "  STT_PROVIDER=local"
Write-Host "  WHISPER_BIN=bin/Release/whisper-cli.exe"
Write-Host "  WHISPER_MODEL=models/ggml-$Model.bin"
