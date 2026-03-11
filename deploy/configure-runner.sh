#!/usr/bin/env bash
# Configure GitHub Actions self-hosted runner with token from repo Settings → Actions → Runners.
# Usage: ./configure-runner.sh <TOKEN> [REPO]
#   TOKEN: one-time token from "New self-hosted runner" (e.g. ABCD...)
#   REPO: optional, default s0iru/vrcsocial (owner/repo)
set -e
RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runner}"
if [ -z "$1" ]; then
  echo "Usage: $0 <TOKEN> [REPO]"
  echo "  Get TOKEN from: GitHub repo → Settings → Actions → Runners → New self-hosted runner"
  echo "  REPO default: s0iru/vrcsocial"
  exit 1
fi
TOKEN="$1"
REPO="${2:-s0iru/vrcsocial}"
if [ ! -x "$RUNNER_DIR/config.sh" ]; then
  echo "Runner not found at $RUNNER_DIR. Extract runner there first."
  exit 1
fi
cd "$RUNNER_DIR"
./config.sh --url "https://github.com/$REPO" --token "$TOKEN"
echo "Configured. Start runner: systemctl --user enable --now actions-runner (if using user unit), or run: cd $RUNNER_DIR && ./run.sh"
