## Extends rules/cts/validation-authorization.md § "LIVR" — fields LIVR can't represent

**LIVR silently drops fields it has no schema key for** — there's no "pass through unknowns" option. `BaseService<Input, Output>` builds its LIVR schema from `validationRules()` and validates the full `Input` against it, so any field LIVR can't represent (e.g. a `Buffer`) is stripped from `validData` even if present on `input`. A service that needs such a field cannot put it on the validated `Input` type — pass it as a separate constructor/method parameter outside the LIVR-validated object instead (see `UploadFirmwareService`, which takes `file: Buffer` this way rather than as an `Input` field).

## Extends rules/cts/validation-authorization.md — new section: HTTP File Uploads

**`@FileInterceptor` defaults to disk storage, not memory.** `@FileInterceptor('file')` without `storage: memoryStorage()` writes the uploaded file to disk and passes `req.file.path` (string path) to the handler, not `req.file.buffer`. If the consumer expects a `Buffer` (e.g., a UseCase taking `Buffer` for GCS upload), the handler receives a path string, fails type checking, and breaks at runtime. Fix: inject `multer`'s `memoryStorage()` into the interceptor options or accept `Readable` stream / path string and read it in the handler.

## Extends rules/cts/validation-authorization.md — new section: HTML Security

**Admin/debug HTML pages: no server-side interpolation of DB data; fetch + `textContent` only.** `apps/api/src/controllers/admin/admin-firmware.template.ts` is a static string with zero interpolation — DB-sourced release data is fetched client-side and rendered via `createElement`/`textContent`, never `innerHTML` or server-side template literals. This eliminates stored/reflected XSS by construction without a templating engine. A naive variant interpolating the releases table into the HTML string server-side would be one malicious version-string away from XSS. Convention: any future admin/debug HTML route must follow the same pattern.

## Extends rules/cts/validation-authorization.md — new section: Placeholder/Sentinel Values Must Fail Loud, Not Silently Vanish

A placeholder that fails validation is worse than one that passes it. A firmware stub value (`"test"`) was rejected by `sanitizeFirmwareVersion()` as non-semver and dropped, leaving the previous value in place — that converted a visibly-wrong device list into one that looked plausible but was months stale, so the drop-invalid hardening made the underlying bug _harder_ to see. Sentinels for a field with server-side validation should be chosen to _pass_ validation and read as obviously wrong (`"0.0.0-test"`), so bad data surfaces instead of silently vanishing. Generalizes to any "drop the invalid field, keep the last good value" policy: pair it with a log line or a metric, otherwise it is indistinguishable from "the source stopped reporting."

## Extends rules/cts/validation-authorization.md § "LIVR" — `required` alone does not validate non-scalar shape

Confirmed by reading `node_modules/livr/lib/rules/common/required.js` and `Validator.js` — when a field's only rule is `required` (no other transform rule), LIVR performs presence-checking only and does not coerce or reject based on type, so an object/discriminated-union value survives `validate()` unchanged. This is the correct way to let a non-scalar field (e.g. a `{ id: string } | { system: true }` caller-context union) pass through a LIVR schema without writing a custom `nested_object` rule, when TS types are relied on for shape enforcement rather than runtime validation.

## Extends rules/cts/validation-authorization.md — new section: Enumeration-Resistance Gate Ordering (`assertCallerHasRole`)

`assertCallerHasRole` only closes the enumeration leak when it runs immediately after the device-existence check, before any other domain branch. A service can reintroduce the leak if it runs other domain logic in between "device found" and the `assertCallerHasRole` call — found in `unlink-device-from-user.service.ts`, where a target-user-link-exists check (`DEVICE_NOT_LINKED`) ran _before_ `assertCallerHasRole`, so a zero-membership caller got a distinguishable response (and a MAC-address leak) instead of the uniform `NotFoundError`.

Enumeration-resistance reviews need a **two-axis check**, not just one:

1. **Requested-value variance** — the gate must apply uniformly across every value the caller can vary in the request (e.g. gating `VIEWER` as strictly as `OWNER`/`EDITOR` on a role-assignment mutation, so a prober can't distinguish device state by varying the requested role and observing which error comes back).
2. **Check-ordering variance** — the gate must run before every pre-existing state-revealing check, not just before the action itself (the `unlink-device-from-user.service.ts` case above).

`LinkDeviceToUserService`'s role-escalation guard closed axis 1 first and initially missed axis 2 (the pre-existing `alreadyLinked` check still ran before `assertCallerHasRole`), caught by `reviewer` in the same gate cycle. When adding a role gate to an existing mutation service, check both axes, not just the one prompting the change. Worth a repo-wide grep for `assertCallerHasRole` call-site position when adding new device services.

## Extends rules/cts/validation-authorization.md — new section: `mac-address.rule.ts` Separator Consistency

The MAC-address regex in `libs/shared/src/lib/validation/custom-rules/mac-address.rule.ts` — `/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/` — validates octet separators independently rather than backreferencing the first separator, so a string mixing `:` and `-` (e.g. `AA:BB-CC:DD:EE:FF`) is **accepted**, not rejected. Not a security bug (format looseness, not an authz/validation-bypass issue), but worth a repo-wide grep if any MAC-address uniqueness/display/dedup logic downstream assumes a single consistent separator style per string.
