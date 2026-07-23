## Extends .claude/agents/reviewer.md § "Pre-flight"

Also read `rules/local/code-style.md`, `rules/local/testing.md`, `rules/local/validation-authorization.md`, and `rules/local/docker-commands.md` — CTS's generic pre-flight only auto-discovers `rules/local/*-backend.md`/`*-angular.md` platform-split files, not this repo's full-name overrides.

## Overrides .claude/agents/reviewer.md § "Project-scope pre-flight"

This repo has no root-level `ARCHITECTURE.md`/`DECISIONS.md`/`CONTEXT.md`. Read these instead:

1. `docs/ARCHITECTURE.md` — layers, serving topology, onion boundaries.
2. `PROJECT_CONTEXT.md` — domain rules, locked decisions, incident history (root-level, project-authored).
3. `docs/KNOWLEDGE_INBOX.md` — accumulated project-specific conventions and discovered issues.

No frontend framework in this repo — skip Vue/React/Angular-specific review guidance from the base definition.
