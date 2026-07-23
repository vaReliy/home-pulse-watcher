## Extends .claude/agents/tester.md § "Pre-flight"

Also read `rules/local/testing.md` and `rules/local/code-style.md` — CTS's generic pre-flight only auto-discovers `rules/local/*-backend.md`/`*-angular.md` platform-split files, not this repo's full-name overrides.

## Overrides .claude/agents/tester.md — test runner

This repo is pure Jest — zero Vitest dependency. Ignore any Vitest-specific wording/APIs in the base agent definition or `vitest-testing` skill; use Jest APIs (`jest.fn`, `jest.mock`, `jest.spyOn`) instead. See `rules/local/testing.md`. Always invoke via `nx test <project>`.

No frontend framework in this repo — skip Vue/React/Angular-specific guidance from the base definition.
