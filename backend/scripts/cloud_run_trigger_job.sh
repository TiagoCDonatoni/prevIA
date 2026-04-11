#!/usr/bin/env bash
set -euo pipefail

: "${SERVICE_URL:?export SERVICE_URL=https://...run.app}"
: "${OPS_TRIGGER_TOKEN:?export OPS_TRIGGER_TOKEN=...}"
: "${JOB_KEY:?export JOB_KEY=...}"

export REQUESTED_BY="${REQUESTED_BY:-manual_cloud}"
export JOB_KWARGS_JSON="${JOB_KWARGS_JSON:-{}}"
export PAYLOAD_JSON="${PAYLOAD_JSON:-{}}"
export CORRELATION_ID="${CORRELATION_ID:-}"
export IDEMPOTENCY_KEY="${IDEMPOTENCY_KEY:-}"

BODY="$(
python - <<'PY'
import json
import os

job_kwargs = json.loads(os.environ.get("JOB_KWARGS_JSON", "{}"))
payload = json.loads(os.environ.get("PAYLOAD_JSON", "{}"))

body = {
    "job_key": os.environ["JOB_KEY"],
    "requested_by": os.environ.get("REQUESTED_BY", "manual_cloud"),
    "job_kwargs": job_kwargs,
    "payload": payload,
}

correlation_id = os.environ.get("CORRELATION_ID", "").strip()
idempotency_key = os.environ.get("IDEMPOTENCY_KEY", "").strip()

if correlation_id:
    body["correlation_id"] = correlation_id

if idempotency_key:
    body["idempotency_key"] = idempotency_key

print(json.dumps(body))
PY
)"

curl -fsS \
  -X POST "${SERVICE_URL}/internal/ops/jobs/run" \
  -H "Content-Type: application/json" \
  -H "X-Ops-Trigger-Token: ${OPS_TRIGGER_TOKEN}" \
  --data "${BODY}"

echo