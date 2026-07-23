## Extends .claude/agents/queue-specialist.md § "Pre-flight"

Also read `rules/local/code-style.md` and `rules/local/docker-commands.md` — CTS's generic pre-flight only auto-discovers `rules/local/*-backend.md`/`*-angular.md` platform-split files, not this repo's full-name overrides.

## Overrides .claude/agents/queue-specialist.md — code style

Match HPW's actual Prettier/ESLint config: single-quote strings, no unnecessary object/argument line-wrapping for short calls. See `rules/cts/code-style.md` for the general rule; this repo's `.prettierrc` governs the exact formatting.
