# Changelog

### UPS Battery Monitoring

Added UPS Edition hardware variant (V2.3) with TP4056 charge/discharge shield, dual-diode OR-gate, and 18650 battery backup. Full-stack battery voltage monitoring via GPIO3 ADC with low-battery SOS Telegram alerts (3400 mV threshold).

### Device Status Tracking

Added `statusChangedAt` field to track when power status last changed, and `collapseEvents` for aggregating rapid power events in Telegram history.

### Observability & Reliability

Structured JSON logging (pino), health check endpoints (`/health/live`, `/health/ready`), startup env validation, Prisma error translation layer, and Telegram webhook diagnostic endpoints.

### Firmware Version Tracking

Devices report firmware version in every status ping; backend stores and displays `firmwareVersion`. Reduced debounce windows in Firmware V3.1 for faster responsiveness.

### Cloud Run Deployment

Docker multi-stage build, Webpack serverless bundling, CI/CD pipeline via GitHub Actions with Workload Identity Federation, and Cloud Scheduler keep-warm job.

### i18n Support

Internationalization for Telegram bot (Ukrainian + English) with per-user locale and timezone settings via `TranslationService`.

### Telegram UI Upgrade

Migrated from slash commands to interactive Reply/Inline keyboards, implemented MarkdownV2 formatting, and added a stateless Settings menu with locale/timezone support.

### Power Sensing v2

Implemented ADC-based sensing with ADC hysteresis, firmware confirmation (~400 ms), and server-side notification debounce (5 s) to eliminate grid flapping noise.
