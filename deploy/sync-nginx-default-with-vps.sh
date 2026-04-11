#!/usr/bin/env bash
# Pull /etc/nginx/sites-enabled/default from the VPS into this repo, edit locally, push back.
#
# Usage:
#   export VPS_USER=kunye
#   export VPS_HOST=165.22.227.234   # or your SSH alias
#   ./deploy/sync-nginx-default-with-vps.sh pull
#   # edit deploy/nginx-vps-sites-enabled-default.conf
#   ./deploy/sync-nginx-default-with-vps.sh push
#
# Requires: ssh / scp access to the VPS (key or password).
#
# push: uses ssh -tt so remote sudo can prompt for a password even when this script has no local TTY
# (e.g. Cursor task runner). If sudo still cannot prompt, use:
#   VPS_PUSH_SCP_ONLY=1 ./deploy/sync-nginx-default-with-vps.sh push
# then run the printed sudo commands in a real terminal on the VPS.

set -euo pipefail
VPS_USER="${VPS_USER:-}"
VPS_HOST="${VPS_HOST:-}"
REMOTE_PATH="/etc/nginx/sites-enabled/default"
LOCAL_REL="deploy/nginx-vps-sites-enabled-default.conf"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ABS="$ROOT/$LOCAL_REL"

if [[ -z "$VPS_USER" || -z "$VPS_HOST" ]]; then
  echo "Set VPS_USER and VPS_HOST, e.g.:"
  echo "  export VPS_USER=kunye VPS_HOST=165.22.227.234"
  exit 1
fi

case "${1:-}" in
  pull)
    scp "${VPS_USER}@${VPS_HOST}:${REMOTE_PATH}" "$LOCAL_ABS"
    echo "Wrote $LOCAL_REL — edit it, then: $0 push"
    ;;
  push)
    if [[ ! -f "$LOCAL_ABS" ]]; then
      echo "Missing $LOCAL_REL — run pull first."
      exit 1
    fi
    scp "$LOCAL_ABS" "${VPS_USER}@${VPS_HOST}:/tmp/nginx-default.updated"
    if [[ "${VPS_PUSH_SCP_ONLY:-}" == "1" ]]; then
      echo ""
      echo "File uploaded to /tmp/nginx-default.updated on ${VPS_HOST}."
      echo "Run on the VPS (SSH session with a TTY):"
      echo "  sudo cp /tmp/nginx-default.updated ${REMOTE_PATH} && sudo nginx -t && sudo systemctl reload nginx && rm -f /tmp/nginx-default.updated"
      echo ""
      exit 0
    fi
    # -tt forces a PTY even when stdin is not a terminal (needed for sudo password in some environments).
    ssh -tt "${VPS_USER}@${VPS_HOST}" "sudo cp /tmp/nginx-default.updated ${REMOTE_PATH} && sudo nginx -t && sudo systemctl reload nginx && rm -f /tmp/nginx-default.updated"
    echo "Deployed to ${REMOTE_PATH} and reloaded nginx."
    ;;
  *)
    echo "Usage: VPS_USER=... VPS_HOST=... $0 pull|push"
    exit 1
    ;;
esac
