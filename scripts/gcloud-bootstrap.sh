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
  printf '\033[0;36m  %s\033[0m\n' "$description"
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
)

for role in "${DEPLOY_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --condition=None \
    --quiet
done
ok "Deploying SA roles granted"

# --------------- Step 5: Grant Secret Manager access to runtime SA ---------------
info "Granting Secret Manager access to Cloud Run runtime service account..."

RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet
ok "Runtime SA can access secrets"

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

# --------------- Step 7: Print configuration ---------------
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
echo "  First deploy"
echo "  ============================================"
echo ""
echo "  1. Add the secrets/variables above to GitHub"
echo "  2. Push to 'main' branch -> CI + deploy will run"
echo "  3. After deploy, find the Cloud Run URL in the workflow output"
echo "  4. Set CLOUD_RUN_URL variable in GitHub to that URL"
echo "  5. Re-run the deploy workflow to enable Telegram webhooks"
echo ""
