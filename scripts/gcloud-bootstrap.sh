#!/usr/bin/env bash
# =============================================================================
# GCP Bootstrap Script for HomePulse Watcher
#
# One-time setup for deploying to Google Cloud Run with Secret Manager.
# Run from Google Cloud Shell or locally via Docker:
#
#   Cloud Shell:  bash scripts/gcloud-bootstrap.sh
#   Docker:       docker run --rm -it -v ~/.config/gcloud:/root/.config/gcloud \
#                   -v "$PWD/scripts":/scripts google/cloud-sdk:stable \
#                   bash /scripts/gcloud-bootstrap.sh
# =============================================================================
set -euo pipefail

# --------------- Configuration ---------------
GITHUB_REPO="vaReliy/home-pulse-watcher"
REGION="europe-west3"
SERVICE_ACCOUNT_NAME="github-actions-cloudrun"
WIF_POOL="github-pool"
WIF_PROVIDER="github-provider"
BACKUP_BUCKET_SUFFIX="backups"
KEEP_WARM_JOB_NAME="home-pulse-keep-warm"

SECRET_NAMES=(
  "database-url"
  "telegram-bot-token"
  "telegram-admin-chat-id"
  "device-secret-encryption-key"
)

SECRET_DESCRIPTIONS=(
  "Neon.tech PostgreSQL connection string (e.g. postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require)"
  "Telegram bot token from @BotFather"
  "Telegram admin chat ID (your numeric Telegram user ID)"
  "Device secret encryption key (64 hex chars, generate with: openssl rand -hex 32)"
)

# --------------- Helpers ---------------
info()  { printf '\n\033[1;34m[INFO]\033[0m  %s\n' "$1"; }
ok()    { printf '\033[1;32m[OK]\033[0m    %s\n' "$1"; }
warn()  { printf '\033[1;33m[WARN]\033[0m  %s\n' "$1"; }

prompt_value() {
  local description="$1" value=""
  printf '\033[0;36m  %s\033[0m\n' "$description" >&2
  read -rp "  Value: " value
  if [[ -z "$value" ]]; then
    warn "Empty value provided, skipping"
    return 1
  fi
  echo "$value"
}

# --------------- Step 0: Project ---------------
info "Google Cloud project setup"

read -rp "  Enter GCP Project ID: " PROJECT_ID
if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: Project ID is required" >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID"
ok "Project set to $PROJECT_ID"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
ok "Project number: $PROJECT_NUMBER"

# --------------- Step 1: Enable APIs ---------------
info "Enabling required APIs..."

APIS=(
  run.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
  secretmanager.googleapis.com
  iam.googleapis.com
  iamcredentials.googleapis.com
)

gcloud services enable "${APIS[@]}"
ok "All APIs enabled"

# --------------- Step 2: Create Secret Manager secrets ---------------
info "Creating Secret Manager secrets..."

for i in "${!SECRET_NAMES[@]}"; do
  name="${SECRET_NAMES[$i]}"
  desc="${SECRET_DESCRIPTIONS[$i]}"

  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    warn "Secret '$name' already exists, skipping creation"
    continue
  fi

  value=$(prompt_value "$desc") || continue
  printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID"
  ok "Secret '$name' created"
done

# --------------- Step 3: Create service account ---------------
info "Creating service account for GitHub Actions..."

SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" &>/dev/null; then
  warn "Service account '$SA_EMAIL' already exists, skipping creation"
else
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="GitHub Actions Cloud Run Deployment"
  ok "Service account created: $SA_EMAIL"
fi

# --------------- Step 4: Grant IAM roles to deploying SA ---------------
info "Granting IAM roles to deploying service account..."

DEPLOY_ROLES=(
  roles/run.admin
  roles/iam.serviceAccountUser
  roles/cloudbuild.builds.editor
  roles/storage.admin
  roles/artifactregistry.admin
  roles/serviceusage.serviceUsageConsumer
)

for role in "${DEPLOY_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --condition=None \
    --quiet
done
ok "Deploying SA roles granted"

# Grant access to database-url secret only (scoped, not project-wide)
info "Granting database-url secret access to deploy SA..."
gcloud secrets add-iam-policy-binding "database-url" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet
ok "Database URL secret access granted"

# --------------- Step 5: Grant IAM roles to runtime / build SA ---------------
info "Granting IAM roles to Cloud Run runtime service account..."

RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

RUNTIME_ROLES=(
  roles/secretmanager.secretAccessor
  roles/run.builder
)

for role in "${RUNTIME_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="$role" \
    --condition=None \
    --quiet
done
ok "Runtime SA roles granted"

# --------------- Step 6: Set up Workload Identity Federation ---------------
info "Setting up Workload Identity Federation for GitHub Actions..."

# Create pool (idempotent-ish: errors if exists, which is fine)
if gcloud iam workload-identity-pools describe "$WIF_POOL" \
     --location="global" --project="$PROJECT_ID" &>/dev/null; then
  warn "Workload Identity Pool '$WIF_POOL' already exists"
else
  gcloud iam workload-identity-pools create "$WIF_POOL" \
    --project="$PROJECT_ID" \
    --location="global" \
    --display-name="GitHub Actions Pool"
  ok "Workload Identity Pool created"
fi

# Create OIDC provider
if gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
     --workload-identity-pool="$WIF_POOL" \
     --location="global" --project="$PROJECT_ID" &>/dev/null; then
  warn "OIDC provider '$WIF_PROVIDER' already exists"
else
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --project="$PROJECT_ID" \
    --location="global" \
    --workload-identity-pool="$WIF_POOL" \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
  ok "OIDC provider created"
fi

# Allow GitHub repo to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" \
  --quiet
ok "GitHub repo linked to service account"

# --------------- Step 7: (Skipped — Cloud Run IAM configured in Step 8b) ---------------
# Cloud Scheduler uses the runtime SA to invoke Cloud Run via OIDC.
# The run.invoker binding is scoped to the Cloud Run service in Step 8b.

# --------------- Step 8: Create backup GCS bucket & lifecycle rule ---------------
info "Setting up database backup infrastructure..."

BACKUP_BUCKET="${PROJECT_ID}-${BACKUP_BUCKET_SUFFIX}"

# Create bucket (idempotent: errors if exists, which is fine)
if gsutil ls "gs://${BACKUP_BUCKET}" &>/dev/null; then
  warn "Backup bucket 'gs://${BACKUP_BUCKET}' already exists"
else
  gsutil mb -l "$REGION" "gs://${BACKUP_BUCKET}"
  ok "Backup bucket created: gs://${BACKUP_BUCKET}"
fi

# Create lifecycle rule (keep 8 weeks = 56 days)
cat > /tmp/backup-lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 56
        }
      }
    ]
  }
}
EOF

gsutil lifecycle set /tmp/backup-lifecycle.json "gs://${BACKUP_BUCKET}"
ok "Backup lifecycle rule set (keep 8 weeks)"

# Harden backup bucket
gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
  --uniform-bucket-level-access \
  --public-access-prevention
ok "Backup bucket hardened (uniform access, public access blocked)"

# Grant runtime SA access to backup bucket (scoped, not project-level)
BACKUP_SA_ROLE="roles/storage.objectCreator"
gcloud storage buckets add-iam-policy-binding "gs://${BACKUP_BUCKET}" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="$BACKUP_SA_ROLE" \
  --quiet
ok "Backup bucket permissions granted to runtime SA (bucket-scoped)"

# Grant OTA service account access to backup bucket
# (same SA used for firmware OTA storage, now also backing up database)
info "Configuring backup-bucket access for OTA service account..."

read -rp "  Enter service account email for GCP_SERVICE_ACCOUNT_KEY (e.g. ota-manager@${PROJECT_ID}.iam.gserviceaccount.com): " OTA_SA_EMAIL
if [[ -z "$OTA_SA_EMAIL" ]]; then
  warn "OTA service account email not provided; skipping backup-bucket IAM grant"
  warn "If using GCP_SERVICE_ACCOUNT_KEY for backups later, manually grant it 'roles/storage.objectCreator' on gs://${BACKUP_BUCKET}"
else
  gcloud storage buckets add-iam-policy-binding "gs://${BACKUP_BUCKET}" \
    --member="serviceAccount:$OTA_SA_EMAIL" \
    --role="$BACKUP_SA_ROLE" \
    --quiet
  ok "Backup bucket permissions granted to OTA service account (bucket-scoped)"
fi

# --------------- Step 8b: Grant Cloud Run invoke permissions to runtime SA ---------------
# This must be done before or after the Cloud Run service is deployed.
# The keep-warm scheduler job (Step 9) will use RUNTIME_SA to authenticate via OIDC.
CLOUD_RUN_SERVICE_NAME="home-pulse-watcher"

if gcloud run services describe "$CLOUD_RUN_SERVICE_NAME" --platform=managed --region="$REGION" &>/dev/null; then
  if gcloud run services add-iam-policy-binding "$CLOUD_RUN_SERVICE_NAME" \
    --region="$REGION" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/run.invoker" \
    --condition=None \
    --quiet 2>/dev/null; then
    ok "Cloud Run invoke permissions granted to runtime SA"
  else
    warn "Could not grant run.invoker to runtime SA (may already exist)"
  fi
fi

# --------------- Step 9: Create keep-warm Cloud Scheduler job ---------------
info "Setting up keep-warm scheduler job..."

# Get Cloud Run service URL
CLOUD_RUN_SERVICE_URL=$(gcloud run services describe "$CLOUD_RUN_SERVICE_NAME" \
  --platform=managed --region="$REGION" \
  --format='value(status.url)' 2>/dev/null || echo "")

if [[ -z "$CLOUD_RUN_SERVICE_URL" ]]; then
  warn "Cloud Run service '$CLOUD_RUN_SERVICE_NAME' not yet deployed. Skipping keep-warm job creation."
  warn "After first deployment, manually create the keep-warm job with:"
  warn "  gcloud scheduler jobs create http $KEEP_WARM_JOB_NAME \\"
  warn "    --location=$REGION \\"
  warn "    --schedule='*/10 * * * *' \\"
  warn "    --uri='<CLOUD_RUN_URL>/api/health/ready' \\"
  warn "    --http-method=GET \\"
  warn "    --attempt-deadline=30s \\"
  warn "    --oidc-service-account-email=\$RUNTIME_SA"
else
  # Create or update the keep-warm job (idempotent-ish)
  if gcloud scheduler jobs describe "$KEEP_WARM_JOB_NAME" --location="$REGION" &>/dev/null; then
    warn "Keep-warm job '$KEEP_WARM_JOB_NAME' already exists"
    # Optionally update if schedule/URI changed
    gcloud scheduler jobs update http "$KEEP_WARM_JOB_NAME" \
      --location="$REGION" \
      --schedule="*/10 * * * *" \
      --uri="${CLOUD_RUN_SERVICE_URL}/api/health/ready" \
      --http-method=GET \
      --attempt-deadline=30s \
      --oidc-service-account-email="$RUNTIME_SA" \
      --quiet 2>/dev/null || warn "Could not update keep-warm job"
  else
    gcloud scheduler jobs create http "$KEEP_WARM_JOB_NAME" \
      --location="$REGION" \
      --schedule="*/10 * * * *" \
      --uri="${CLOUD_RUN_SERVICE_URL}/api/health/ready" \
      --http-method=GET \
      --attempt-deadline=30s \
      --oidc-service-account-email="$RUNTIME_SA" \
      --quiet
    ok "Keep-warm job created: $KEEP_WARM_JOB_NAME (every 10 minutes)"
  fi
fi

# --------------- Step 10: Print configuration ---------------
WIF_PROVIDER_FULL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"

info "Bootstrap complete! Configure your GitHub repository:"
echo ""
echo "  ============================================"
echo "  GitHub Repository Secrets (Settings > Secrets > Actions)"
echo "  ============================================"
echo ""
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER:"
echo "    $WIF_PROVIDER_FULL"
echo ""
echo "  GCP_SERVICE_ACCOUNT:"
echo "    $SA_EMAIL"
echo ""
echo "  ============================================"
echo "  GitHub Repository Variables (Settings > Variables > Actions)"
echo "  ============================================"
echo ""
echo "  CLOUD_RUN_URL:"
echo "    (leave empty for first deploy, set after you get the URL)"
echo ""
echo "  ============================================"
echo "  Database Backups"
echo "  ============================================"
echo ""
echo "  Backups are stored in: gs://${BACKUP_BUCKET}/"
echo "  Retention: 8 weeks"
echo ""
echo "  To manually backup (Docker):"
echo "    ./scripts/run-backup-in-docker.sh"
echo "  Or (local postgres with gcloud auth):"
echo "    set -a && source .env && set +a"
echo "    bash scripts/backup-database.sh"
echo ""
echo "  ============================================"
echo "  Keep-Warm Scheduler"
echo "  ============================================"
echo ""
echo "  Job: $KEEP_WARM_JOB_NAME"
echo "  Schedule: Every 10 minutes"
echo "  Target: /api/health/ready (keeps Cloud Run warm + Neon compute awake)"
echo ""
echo "  ============================================"
echo "  First deploy"
echo "  ============================================"
echo ""
echo "  1. Add the secrets/variables above to GitHub"
echo "  2. Push to 'main' branch -> CI + deploy will run"
echo "  3. After deploy, find the Cloud Run URL in the workflow output"
echo "  4. Set CLOUD_RUN_URL variable in GitHub to that URL"
echo "  5. Re-run the deploy workflow to enable Telegram webhooks"
echo ""
