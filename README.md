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

# Register a new device
node apps/api/dist/cli.js device:register --mac AA:BB:CC:DD:EE:FF --label "Kitchen"

# Create a user
node apps/api/dist/cli.js user:create --telegram-id 123456789

# Link a device to a user
node apps/api/dist/cli.js device:link --telegram-id 123456789 --mac AA:BB:CC:DD:EE:FF --role OWNER

# List devices for a user
node apps/api/dist/cli.js device:list --user-id <uuid>
```

See [CLI Reference](./docs/cli-reference.md) for full documentation.

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

See [Device Provisioning Guide](./docs/device-provisioning-guide.md) for the complete setup workflow.

## 🗺 Roadmap

- [x] Phase 0: System Architecture & Initial Setup
- [x] Phase 1: Domain Entities & Persistence Layer
- [x] Phase 2: Device Provisioning CLI
- [x] Phase 3: Core Power Status Logic & Event Handling
- [x] Phase 4: Telegram Bot Integration
- [ ] Phase 5: Advanced Analytics & Uptime Tracking

📄 License

This project is licensed under the MIT License.
