#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
export TOOLBOX_HOST="${TOOLBOX_HOST:-127.0.0.1}"
export TOOLBOX_PORT="${TOOLBOX_PORT:-5088}"
admin_token="${TOOLBOX_ADMIN_TOKEN:-}"
if [ ${#admin_token} -lt 12 ]; then
  echo "TOOLBOX_ADMIN_TOKEN is required and must be at least 12 characters" >&2
  exit 1
fi
exec python3 app.py
