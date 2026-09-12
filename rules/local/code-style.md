## Extends rules/cts/code-style.md — new section: Do Not Drop `!= null` Guards Before Relational Comparisons

`strictNullChecks` rejects relational operators (`>`, `<`, `>=`, `<=`) applied directly to an operand typed `T | null` or `T | undefined` — TS raises `TS2531`/`TS2532` even though the JS runtime semantics of `null > 0` (`false`) would otherwise make the guard look redundant. This applies **regardless of whether the narrowed value is reused afterward** — it's a type error on the comparison expression itself, not just a missed-narrowing issue further downstream.

```typescript
// value: number | null
if (value != null && value > 0) { ... }   // required — value > 0 alone is a TS2531 compile error
```

Keep the explicit `!= null`/`!== null` guard any time the operand's type includes `null`/`undefined`. This pattern is not eligible for simplification in strict TS — don't attempt it even for boolean-only return values.

## Extends rules/cts/code-style.md — new section: Configuration & Secrets

A value that's a deterministic function of an existing input shouldn't become its own separate secret or env var. **Example**: `GCS_BACKUP_BUCKET` was initially added as its own required env var/GitHub secret, but its value is always `${PROJECT_ID}-backups` — fully derivable from the already-known/authenticated GCP project. Storing it separately created a manual-sync footgun (the secret could silently drift from what bootstrap actually created). **Fix**: compute it inline from the authenticated context (`gcloud config get-value project`) rather than duplicating it as configuration.
