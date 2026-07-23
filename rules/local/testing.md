## Overrides rules/cts/testing.md — test runner

This repo is pure Jest (`@nx/jest`, `ts-jest`/`@swc/jest` in every app/lib) — zero Vitest dependency in `package.json`. Where `rules/cts/testing.md` or the `vitest-testing` skill shows Vitest APIs (`vi.fn`, `vi.mock`, `vi.spyOn`, `vi.stubEnv`, import from `'vitest'`), use the Jest equivalents (`jest.fn`, `jest.mock`, `jest.spyOn`; `jest`/`describe`/`it`/`expect` are globals, no import needed) instead. Always invoke tests via `nx test <project>`, never `docker compose exec app npx vitest/jest` directly.
