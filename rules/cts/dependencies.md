# Dependency Management

On-demand: read when adding, updating, or removing an npm/pnpm dependency, or after any Nx generator that injects deps into `package.json`.

## Exact-pin everything

No `^` or `~` ranges, ever — in `dependencies`, `devDependencies`, or `peerDependencies`. The invariant is non-negotiable; this file describes how to enforce it.

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

Reproducible installs across machines and CI; no silent minor/patch drift. Nx generators are the most common source of injected caret ranges (webpack, webpack-cli, webpack-dev-server, axios, etc.), so the audit is mandatory whenever a generator touched `package.json`.

## Pinning CI Actions to a Commit SHA

When resolving a tag to a commit SHA for pinning, always dereference via `refs/tags/<tag>^{}` (or use `gh api repos/<owner>/<repo>/commits/<tag>`, which returns the commit directly) — never trust the bare `refs/tags/<tag>` SHA without checking whether the tag is annotated. `git ls-remote refs/tags/<tag>` on an **annotated** tag returns the tag _object_ SHA, not the commit it points at; both are 40 hex characters, so "is this 40 hex chars" does not catch the mistake. A GitHub Action pinned via the bare ref can silently resolve to a tag-object SHA instead of the actual commit — only independently re-resolving and diffing every pin catches this, since lightweight tags (where the bare ref already equals the commit SHA) aren't affected and can mask the pattern in a batch of pins.

## Metadata-Only Manifests (`@nx/dependency-checks` file-scoping)

`@nx/dependency-checks` only fires on files whose path ends in `/package.json` — the rule silently no-ops (returns `{}`) on any project with no manifest at all, with no error or warning. A project's `package.json` for this purpose does not need to be a package-manager workspace member (ESLint and the Nx graph don't consult the package manager) — one viable pattern is a **metadata-only manifest**: a project carries a `package.json` purely for the Nx graph and dependency-checks, deliberately excluded from the workspace manifest's globs so it never becomes a real workspace importer.

Declare every workspace-lib import as a real dependency in the importing project's `package.json` (`nx lint <project> --fix` writes these automatically) — never blanket `ignoredDependencies`, which mutes exactly the drift the rule exists to catch.

**Verification is not a claim** — see `rules/cts/workflow.md`'s quality-gate scratch-violation-proof rule: confirm a dependency-checks fix actually fires by removing an imported dep, running `nx lint <project>`, and watching it fail, before trusting "it will fire" from an agent's report.

**Lockfile-diff false alarm**: a large lockfile diff after an install can be pure re-serialization by a newer package-manager version (e.g. inlining `resolution:` objects that an older format spread over multiple lines) rather than an actual dependency change. Verify by diffing the sorted package-key sets before suspecting dependency drift — if they're byte-identical, it's reserialization noise.

## Monorepo Library Dependencies

### Every lib that directly imports a shared lib needs its own `package.json` entry

When adding a new intra-monorepo import to a library, check that lib's `package.json`:`dependencies` to confirm the shared lib is listed. `@nx/dependency-checks` linter will catch this as a hard error, but catching it early during implementation prevents lint failures. When a shared type/const moves to a new shared lib, every consuming lib's `package.json` needs the new dependency entry, not just the first one touched — grep for the import across all libs after the move, not just the one you're actively editing.

### pnpm monorepo: root-only dependencies require `-w` flag

In a pnpm monorepo with `node-linker=hoisted`, adding dependencies that live at workspace root (not app subfolder) requires the `-w` flag:

```bash
# ❌ Wrong — fails because there's no package.json in the app folder
pnpm add nest-commander --save-exact

# ✓ Correct
pnpm add nest-commander --save-exact -w
```

This applies to workspace-root-only deps like build tools, CLI packages, and workspace utilities.
