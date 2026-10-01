#!/usr/bin/env bash
set -euo pipefail

DECK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8899}"
URL="http://localhost:${PORT}/editor.html?deck=http://localhost:${PORT}/index.html"

echo "Editor ready: ${URL}"
( sleep 1; open "${URL}" ) &

cd "${DECK_DIR}"
exec python3 -m http.server "${PORT}"
