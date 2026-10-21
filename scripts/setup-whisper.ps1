# One-time setup for the self-hosted whisper.cpp STT provider (Phase 2).
# Downloads the ggml model and builds the whisper-cli binary.
# Usage:  powershell scripts/setup-whisper.ps1 [-Model small]
#         (models: tiny | base | small | medium — small is a good Hindi/English default)
param([string]$Model = "small")
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$srv  = Join-Path $root 'server'
New-Item -ItemType Directory -Force (Join-Path $srv 'models') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $srv 'bin') | Out-Null

# ---- 1. model file -----------------------------------------------------------
$modelFile = Join-Path $srv "models\ggml-$Model.bin"
if (Test-Path $modelFile) {
  Write-Host "model already present: $modelFile"
} else {
  $url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$Model.bin"
  Write-Host "downloading model: $url"
  Invoke-WebRequest -Uri $url -OutFile $modelFile
}

# ---- 2. binary ---------------------------------------------------------------
# Recent whisper.cpp releases ship no prebuilt Windows binaries, so we build
# from source. Requires: CMake + Visual Studio Build Tools (C++ workload).
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
  Write-Warning "cmake not found — the model is downloaded, but the binary still needs building."
  Write-Host "Install CMake + 'Visual Studio Build Tools' (C++ workload), then re-run this script."
  exit 0
}

$src = Join-Path $srv 'whisper-src'
if (-not (Test-Path $src)) {
  Write-Host "cloning whisper.cpp ..."
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp $src
}

Write-Host "building whisper-cli (first build takes a few minutes) ..."
cmake -S $src -B (Join-Path $src 'build') -DGGML_NATIVE=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build (Join-Path $src 'build') --config Release --target whisper-cli

Copy-Item (Join-Path $src 'build\bin\Release\whisper-cli.exe') (Join-Path $srv 'bin\') -Force

Write-Host ""
Write-Host "Done. Enable it in server/.env:"
Write-Host "  STT_PROVIDER=local"
Write-Host "  WHISPER_BIN=bin/whisper-cli.exe"
Write-Host "  WHISPER_MODEL=models/ggml-$Model.bin"
