#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?export GCP_PROJECT_ID=...}"
: "${GCP_REGION:?export GCP_REGION=...}"
: "${CLOUD_RUN_SERVICE:?export CLOUD_RUN_SERVICE=...}"
: "${CLOUD_SQL_CONNECTION_NAME:?export CLOUD_SQL_CONNECTION_NAME=project:region:instance}"

: "${DATABASE_URL_SECRET:?export DATABASE_URL_SECRET=...}"
: "${APIFOOTBALL_KEY_SECRET:?export APIFOOTBALL_KEY_SECRET=...}"
: "${THE_ODDS_API_KEY_SECRET:?export THE_ODDS_API_KEY_SECRET=...}"
: "${OPS_TRIGGER_TOKEN_SECRET:?export OPS_TRIGGER_TOKEN_SECRET=...}"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  --project "${GCP_PROJECT_ID}"

gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --platform managed \
  --source . \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --timeout 3600 \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 1 \
  --add-cloudsql-instances "${CLOUD_SQL_CONNECTION_NAME}" \
  --env-vars-file cloudrun.env.yaml \
  --set-env-vars "APIFOOTBALL_BASE_URL=https://v3.football.api-sports.io" \
  --set-env-vars "THE_ODDS_API_BASE_URL=https://api.the-odds-api.com/v4" \
  --set-secrets "DATABASE_URL=${DATABASE_URL_SECRET}:latest" \
  --set-secrets "APIFOOTBALL_KEY=${APIFOOTBALL_KEY_SECRET}:latest" \
  --set-secrets "THE_ODDS_API_KEY=${THE_ODDS_API_KEY_SECRET}:latest" \
  --set-secrets "OPS_TRIGGER_TOKEN=${OPS_TRIGGER_TOKEN_SECRET}:latest" \
  --quiet

SERVICE_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --format='value(status.url)')"

echo "OK: Cloud Run deployed"
echo "SERVICE_URL=${SERVICE_URL}"