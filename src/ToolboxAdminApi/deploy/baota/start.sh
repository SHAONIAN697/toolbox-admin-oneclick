#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
export TOOLBOX_HOST="${TOOLBOX_HOST:-127.0.0.1}"
export TOOLBOX_PORT="${TOOLBOX_PORT:-5088}"
export TOOLBOX_ADMIN_TOKEN="${TOOLBOX_ADMIN_TOKEN:-dev-token}"
exec python3 app.py
