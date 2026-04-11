#!/usr/bin/env bash
set -euo pipefail

: "${SERVICE_URL:?export SERVICE_URL=https://...run.app}"

curl -fsS "${SERVICE_URL}/health"
echo