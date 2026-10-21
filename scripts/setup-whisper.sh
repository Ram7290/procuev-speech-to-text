#!/usr/bin/env sh
# One-time setup for the self-hosted whisper.cpp STT provider (Phase 2).
# Usage: MODEL=small ./scripts/setup-whisper.sh
MODEL="${MODEL:-small}"

root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/server/models" "$root/server/bin"

# ---- 1. model ----------------------------------------------------------------
if [ -f "$root/server/models/ggml-$MODEL.bin" ]; then
  echo "model already present: ggml-$MODEL.bin"
else
  echo "downloading model ggml-$MODEL ..."
  curl -L -o "$root/server/models/ggml-$MODEL.bin" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
fi

# ---- 2. binary ----------------------------------------------------------------
if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake not found — install it (and a C/C++ toolchain), then re-run." >&2
  exit 1
fi

src="$root/server/whisper-src"
if [ ! -d "$src" ]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$src"
fi

echo "building whisper-cli ..."
cmake -S "$src" -B "$src/build" -DGGML_NATIVE=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build "$src/build" --target whisper-cli -j"$(nproc 2>/dev/null || echo 2)"
cp "$src/build/bin/whisper-cli" "$root/server/bin/"

echo "Done. Enable in server/.env:"
echo "  STT_PROVIDER=local"
echo "  WHISPER_BIN=bin/whisper-cli"
echo "  WHISPER_MODEL=models/ggml-$MODEL.bin"
