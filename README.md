# 🏠⚡🔌 HomePulse Watcher

**HomePulse Watcher** is an open-source, DIY power stability monitoring solution. It provides real-time notifications about power outages and restoration directly to your Telegram, helping you stay informed about your home or office grid status.

## 🚀 Key Features

- **Real-time Monitoring:** Instant alerts when power goes down or comes back up.
- **Multi-device Support:** A single backend manages multiple devices across different locations.
- **Secure Communication:** Device authentication using HMAC signatures (Salt + Hash).
- **Clean Architecture:** Built using Onion Architecture (DDD) principles for high testability and maintainability.

## 🛠 Tech Stack

### Hardware

- **MCU:** ESP32-C3/ESP32-C6 SuperMini (RISC-V).
- **Sensor:** Non-contact monitoring via a 220V -> 5V USB adapter logic.
- **Power:** UPS-backed ESP32 to ensure operation during blackouts.

### Software

- **Monorepo:** [Nx](https://nx.dev/)
- **Framework:** [NestJS](https://nestjs.com/)
- **ORM:** [Prisma v7+](https://www.prisma.io/)
- **Database:** PostgreSQL (Dockerized)
- **Validation:** LIVR (Robust runtime validation)
- **Logging:** [nestjs-pino](https://github.com/iamolegga/nestjs-pino) (JSON in prod, pretty in dev)

## 📁 Project Structure (Onion Architecture)

The project follows the Dependency Rule where inner layers do not know about outer layers:

- **Core (Domain):** Pure business entities (`Device`, `User`) and Repository interfaces. Framework-agnostic.
- **Application:** Use Cases (e.g., `ProcessPowerStatusUpdate`).
- **Infrastructure:** Implementations of repositories (`Prisma`), Telegram API integration, and Security logic.
- **Interface:** Inbound adapters (REST API for devices, Telegram Bot for users).

## 🚦 Quick Start

### 1. Prerequisites

Ensure you have Node.js, Docker, and Nx CLI installed.

### 2. Installation

```bash
git clone [https://github.com/vaReliy/home-pulse-watcher.git](https://github.com/vaReliy/home-pulse-watcher.git)
cd home-pulse-watcher
npm install
```

### 3. Environment Setup

```bash
cp .env.example .env
# Edit .env with your specific database credentials and bot tokens
```

### 4. Infrastructure Launch

```bash
docker-compose up -d
npx prisma generate
npx prisma migrate dev
```

### 5. Start Development Server

```bash
npx nx serve api
```

### 6. CLI Commands (Device Provisioning)

```bash
# Build first
npx nx build api

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Create a user
node apps/api/dist/cli.js user:create --telegram-id 123456789 --username johndoe

# List users
node apps/api/dist/cli.js user:list

# Register a new device
node apps/api/dist/cli.js device:register --mac AA:BB:CC:DD:EE:FF --label "Kitchen"

# List devices for a user (by user ID or Telegram ID)
node apps/api/dist/cli.js device:list --user-id <uuid>
node apps/api/dist/cli.js device:list --telegram-id 123456789

# Link a device to a user
node apps/api/dist/cli.js device:link --telegram-id 123456789 --mac AA:BB:CC:DD:EE:FF --role OWNER
```

See [CLI Reference](./docs/cli-reference.md) for full documentation and the [Admin Guide](./docs/admin-guide.md) for the complete setup workflow.

### 7. ESP32 Firmware

ESP32 firmware for power monitoring devices is located in the `firmware/` directory.

```bash
cd firmware/esp32c3  # or esp32c6

# Configure secrets
cp include/secrets.h.example include/secrets.h
# Edit secrets.h with WiFi and device credentials

# Build and flash
pio run -t upload
```

See [Admin Guide](./docs/admin-guide.md) for the complete setup workflow.

## 🚀 Production Deployment (Cloud Run + Neon.tech)

### Prerequisites

- Google Cloud account with billing enabled
- [Neon.tech](https://neon.tech/) PostgreSQL database created
- Telegram bot token from [@BotFather](https://t.me/BotFather)

No local `gcloud` CLI installation required -- all setup runs in [Google Cloud Shell](https://shell.cloud.google.com/) or via the `google/cloud-sdk` Docker image.

### Database Setup (Neon.tech)

1. Create a project in [Neon Console](https://console.neon.tech/)
2. Copy the connection string (includes `?sslmode=require` by default)
3. No application code changes needed -- the `pg` driver handles SSL via the connection string

### Bootstrap (one-time)

The bootstrap script creates all GCP resources: APIs, Secret Manager secrets, service account, and Workload Identity Federation for GitHub Actions.

**Option A -- Google Cloud Shell (recommended, zero install):**

1. Open [Cloud Shell](https://shell.cloud.google.com/)
2. Clone the repo and run the script:

```bash
git clone https://github.com/vaReliy/home-pulse-watcher.git
cd home-pulse-watcher
bash scripts/gcloud-bootstrap.sh
```

**Option B -- Docker (no local gcloud install):**

```bash
docker run --rm -it \
  -v ~/.config/gcloud:/root/.config/gcloud \
  -v "$PWD/scripts":/scripts \
  google/cloud-sdk:stable bash

# Inside the container:
gcloud auth login
bash /scripts/gcloud-bootstrap.sh
```

The script will prompt for your GCP project ID and secret values, then print the GitHub configuration values you need.

### First Deploy

1. Add the values printed by the bootstrap script to your GitHub repository:
   - **Secrets** (`Settings > Secrets > Actions`): `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
   - **Variable** (`Settings > Variables > Actions`): `CLOUD_RUN_URL` (leave empty for first deploy)
2. Push to `main` -- CI runs tests, then deploys to Cloud Run
3. Find the Cloud Run service URL in the workflow output
4. Set the `CLOUD_RUN_URL` variable in GitHub to that URL
5. Re-run the deploy workflow (or push another change) -- Telegram webhooks are now enabled

### CI/CD with GitHub Actions

Deployments are **manual-only** during the MVP phase. To deploy, go to the repository's **Actions** tab → select **"Deploy to Cloud Run"** → click **"Run workflow"** → choose the `main` branch → click **"Run workflow"**. This runs the full CI + deploy pipeline.

Auto-deploy on push to `main` is commented out in `deploy.yml` and can be re-enabled later.

### Keep-Warm (Cloud Scheduler)

Cloud Run scales to zero after ~15 minutes of inactivity. To keep the instance warm for responsive Telegram bot interactions, create a Cloud Scheduler job (free tier: 3 jobs):

```bash
gcloud scheduler jobs create http home-pulse-keep-warm \
  --location=europe-west3 \
  --schedule="*/15 * * * *" \
  --uri="<CLOUD_RUN_URL>/api" \
  --http-method=GET \
  --attempt-deadline=30s
```

Sensitive values are stored in **GCP Secret Manager** (not as GitHub secrets or plain env vars):

| GCP Secret                     | Cloud Run Env Var              |
| ------------------------------ | ------------------------------ |
| `database-url`                 | `DATABASE_URL`                 |
| `telegram-bot-token`           | `TELEGRAM_BOT_TOKEN`           |
| `telegram-admin-chat-id`       | `TELEGRAM_ADMIN_CHAT_ID`       |
| `device-secret-encryption-key` | `DEVICE_SECRET_ENCRYPTION_KEY` |
| `telegram-webhook-secret`      | `TELEGRAM_WEBHOOK_SECRET`      |

**GitHub repository configuration:**

| Type     | Name                             | Description                                  |
| -------- | -------------------------------- | -------------------------------------------- |
| Secret   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider        |
| Secret   | `GCP_SERVICE_ACCOUNT`            | GCP service account email                    |
| Variable | `CLOUD_RUN_URL`                  | Cloud Run service URL (for Telegram webhook) |

### Local Production Testing

```bash
# Start full stack (Postgres + API) using the production Dockerfile
docker-compose --profile full up --build

# API available at http://localhost:8080/api
```

## 🗺 Roadmap

- [x] Phase 0: System Architecture & Initial Setup
- [x] Phase 1: Domain Entities & Persistence Layer
- [x] Phase 2: Device Provisioning CLI
- [x] Phase 3: Core Power Status Logic & Event Handling
- [x] Phase 4: Telegram Bot Integration
- [ ] **Phase 5: Production Hardening** _(In Progress)_
  - [x] 5.1: Power Sensing v2 — ADC-based sensing with ADC hysteresis, firmware confirmation (~400 ms), and server-side notification debounce (5 s)
  - [x] 5.2: Telegram UX/UI Upgrade — Migrated from slash commands to interactive Reply/Inline keyboards with MarkdownV2 formatting and stateless Settings menu
  - [x] 5.3: Observability — Structured JSON logging (pino), health check endpoints (`/health/live`, `/health/ready`), startup env validation
  - [ ] 5.4: Wi-Fi Provisioning — Implement Captive Portal to remove hardcoded Wi-Fi credentials from firmware
  - [ ] 5.5: OTA Updates — Remote firmware updates via Google Cloud Storage triggered by Telegram commands; includes "Admin Force Update" to trigger remote flashing of specific devices
  - [ ] 5.6: Admin CLI Integration — Specialized slash commands for remote device management (reboot, log retrieval) restricted to owners

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.

📄 License

This project is licensed under the MIT License.
