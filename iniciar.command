#!/bin/bash
set -euo pipefail
# Arranque a partir do código-fonte. A versão DMG abre directamente pelo Finder.
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
exec npm start
