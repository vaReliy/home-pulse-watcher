# Dependency Management

On-demand: read when adding, updating, or removing an npm/pnpm dependency, or after any
Nx generator that injects deps into `package.json`.

## Exact-pin everything

No `^` or `~` ranges, ever — in `dependencies`, `devDependencies`, or `peerDependencies`.
The invariant is non-negotiable; this file describes how to enforce it.

## Audit + pin procedure

Run after every `pnpm add` and after every `nx g …` that modifies `package.json`:

1. **Audit**: `grep -E '"\^|"~' package.json` — must return empty.
2. **Get the exact version** for each offending package:
   ```bash
   node -p "require('<pkg>/package.json').version"
   ```
   Alternatively, find the resolved version in `pnpm-lock.yaml`.
3. **Replace** the range with the exact version string. Re-run the grep to confirm empty.

Example fix:

```json
// before (generator-injected)
"webpack": "^5.99.9"

// after
"webpack": "5.99.9"
```

## Why

Reproducible installs across machines and CI; no silent minor/patch drift. Nx generators
are the most common source of injected caret ranges (webpack, webpack-cli, webpack-dev-server,
axios, etc.), so the audit is mandatory whenever a generator touched `package.json`.
