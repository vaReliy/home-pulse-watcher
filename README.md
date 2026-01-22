# 🏠⚡🔌 HomePulse Watcher

**HomePulse Watcher** is an open-source, DIY power stability monitoring solution. It provides real-time notifications about power outages and restoration directly to your Telegram, helping you stay informed about your home or office grid status.

## 🚀 Key Features

- **Real-time Monitoring:** Instant alerts when power goes down or comes back up.
- **Multi-device Support:** A single backend manages multiple devices across different locations.
- **Secure Communication:** Device authentication using HMAC signatures (Salt + Hash).
- **Clean Architecture:** Built using Onion Architecture (DDD) principles for high testability and maintainability.

## 🛠 Tech Stack

### Hardware

- **MCU:** ESP32-C3 SuperMini (RISC-V).
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

🗺 Roadmap

- [x] Phase 0: System Architecture & Initial Setup

- [ ] Phase 1: Domain Entities & Persistence Layer

- [ ] Phase 2: Device Provisioning CLI

- [ ] Phase 3: Core Power Status Logic & Event Handling

- [ ] Phase 4: Telegram Bot Integration

- [ ] Phase 5: Advanced Analytics & Uptime Tracking

📄 License

This project is licensed under the MIT License.
