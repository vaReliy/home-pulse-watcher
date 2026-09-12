## Extends rules/cts/migrations-queue.md — new section: CHECK Constraints & New Columns

**Retrofitted CHECK constraints can break existing data at apply time.** When adding a new CHECK constraint to a column that has pre-existing heterogeneous data, migration apply fails with Postgres error code 23514 (check constraint violation) and becomes unrecoverable without manual `migrate resolve --rolled-back` + cleanup. A migration `ADD CONSTRAINT` validates existing data at apply time.

**Example**: Migration `20260505000002_fix_firmware_release_gcs_path_constraint` broke on prod-shaped data because pre-Phase-5.6 `FirmwareRelease` rows used the legacy `{board}/{version}.bin` format (without the `firmware/` prefix), causing the new CHECK constraint to reject them. The broken migration blocked all later migrations.

**Prevention**: Before `prisma migrate deploy`, manually inspect any affected tables for legacy rows:

```sql
SELECT "gcsPath" FROM "FirmwareRelease" WHERE "gcsPath" !~ '^firmware/';
```

If legacy rows exist, backfill them via a **new forward migration** (never edit an already-applied one). Only after confirmed cleanup, proceed with the CHECK-constraint migration.

**Contrast: New columns with defaults + constraints are always safe.** When adding a new column with `@db.String` and `@default("value")`, even if a CHECK constraint is added in the same migration (e.g., `@db.String @default("MAINS")`), Postgres backfills the default to all existing rows **before** enforcing the constraint. The constraint never fails on existing data. This is distinct from the retrofit hazard — new columns with defaults + constraints in one migration always succeed. The danger is mutating/removing the default later without data backfill.
