# Nx Generator Hygiene

Read this AFTER running any `nx g …` generator (apps, libs, configs) and BEFORE handing off to the quality gate. Generators produce working-but-unpolished output; every item below has shipped as a real defect.

## 1. Audit injected dependencies

Generators write caret ranges (`^`) into `package.json` (webpack, webpack-cli, axios, …). Run the audit + exact-pin procedure in `rules/dependencies.md` before handoff. Short form: `grep -E '"\^|"~' package.json` must return empty.

## 2. Fix the generated tsconfig

The repo base (`tsconfig.base.json`) is intentionally minimal: no `strict` block, `"moduleResolution": "bundler"` + `"module": "esnext"`. A generated project does **NOT** inherit strictness — declare it explicitly in the project's `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Module-format contract (applies to every app and lib in this monorepo):**

- `tsconfig.base.json` sets `"moduleResolution": "bundler"` + `"module": "esnext"` for the whole workspace. All projects inherit this.
- A webpack-bundled **Nest app** must **not** override `module`/`moduleResolution`. Do **not** add `"module": "commonjs"`, `"moduleResolution": "node10"` (or `"node"`/`"node16"`), or `"ignoreDeprecations"`. Webpack already emits a CommonJS Node bundle at runtime — the TypeScript resolver setting does not change the runtime format.
- **Libs** are ESM (`"type": "module"` in `package.json`) and inherit `bundler`; they are consumed from source via tsconfig `paths` and bundled into apps — never published standalone, so `nodenext` is not needed.
- `.js` extensions on relative imports are enforced **backend-only** via ESLint (D26/D29). Angular/Nx paths use barrel `index.ts` exports and do not need the extension.

## 3. Post-generator corrections by framework

### Vitest Test Target Configuration

The Nx plugin registers the test target as `vite:test` (configured via `testTargetName: "vite:test"` in `nx.json`). Running `pnpm nx test <project>` silently resolves to nothing. Always use `pnpm nx vite:test <project> --skip-nx-cache` for unit test runs in this repo.

### Angular Style Files — SCSS Only

Repo standard: all style files must use SCSS (not CSS). The `@nx/angular:app` and `@nx/angular:lib` generators default to CSS; generated files must be renamed `.css` → `.scss` and all `styleUrl`/`styles` references updated. Also update `apps/*/project.json` `"styles"` array. Pass `--style=scss` to generators to reduce post-gen work.

### Angular Generator Flag Requirements

- `@nx/angular:app` and `@nx/angular:lib` **must** be scaffolded via `nx g`, never created manually. The generator registers the project in the NX workspace graph, ensures the full tsconfig inheritance chain, and configures targets/executors correctly. Manual creation (writing project.json by hand) breaks `nx affected` and may misconfigure lint/test runners. Always use: `pnpm nx g @nx/angular:lib <path> --tags=… --style=scss --standalone --no-interactive`, then audit per this file's sections.

- `@nx/angular:lib` generator **silently ignores positional arguments** when `--directory` is absent. Running `nx g @nx/angular:lib <group>/<name>` (positional) without `--directory` strips the prefix and places the lib in the wrong location. Always pair `--name=<project-name>` with `--directory=libs/<path>` explicitly. The generator output confirms the resolved root — verify it matches the intended path.

- `@nx/angular:app` and `@nx/angular:lib` require `--name` flag for the project name (not a positional arg). Correct: `pnpm nx g @nx/angular:app --name=web --directory=apps/web …`. Positional arguments fail with "Schema does not support positional arguments".
- `@nx/angular:component` uses `--path=libs/<lib>/src/lib/<component-folder>/<component-name>` (path to the component file without extension), not `--project`. This changed in Nx v23.

### Angular-Generated vite.config.mts Cleanup

`@nx/angular:app` and `@nx/angular:lib` generators inject `nxViteTsPaths()` and `nxCopyAssetsPlugin()` from `@nx/vite/plugins/…` which are banned by the repo's ESLint `no-restricted-imports` rule (removed in Nx v24). These are mandatory post-generator fixes:

1. Remove imports of `@nx/vite/plugins/…`
2. Replace with `resolve: { tsconfigPaths: true }` in the vite config
3. Drop the `nxCopyAssetsPlugin()` call

Also audit the generated stub spec file — it may import the class name without the "Component" suffix (e.g., `GreetingPage` instead of `GreetingPageComponent`). Correct the import before writing test logic.

## 4. Wire process bootstrap (LIVR)

A new process entrypoint (`main.ts`, CLI, queue worker) must call `registerLivrRules()` from `shared-kernel` **exactly once** at startup, before any `BaseService` or `LIVR.Validator` runs. `BaseService` does not self-register rules.

**Omitting it passes build and tsc but throws at the first validation call at runtime.**

See `rules/validation-authorization.md` → _LIVR bootstrap_ section for the call site.

## 5. Audit companion projects

Generators scaffold sibling projects (e.g. `apps/<name>-e2e`). Audit them too:

- Remove or narrow any blanket `/* eslint-disable */` the generator added — fix the underlying lint issue (e.g. `no-var → const/let`) instead of suppressing the whole file.
- Delete a companion project you don't intend to use rather than leaving it lint-disabled.

## 6. Generator-Hygiene Gotchas

### Skipping the generator: silently dropped out of `lint` forever

A hand-scaffolded lib missing `eslint.config.mjs` gets no inferred `lint` target from `@nx/eslint/plugin` (which infers the target from that file's presence) — `nx show projects --with-target lint` silently excludes it, and `nx affected -t lint` never touches it, with no error or warning. Periodic audit: compare `nx show projects` against `nx show projects --with-target lint` (see `rules/workflow.md`'s Command Execution Policy section). If a hand-scaffolded lib is found missing config files, diff its file listing against a known-generated sibling to find the gaps.

### `@nx/vitest`-based projects need a manually-added `typecheck` target

`@nx/vite/plugin`'s `typecheckTargetName` option only auto-generates a `typecheck` target for projects whose test target comes from `@nx/vite:build` — projects whose test target is inferred by `@nx/vitest` get no `typecheck` target at all, so a type error in a spec file (wrong mock shape, stale import, `any`-typed mock hiding a real error) can pass silently forever. Fix: add an `nx:run-commands` target by hand that replicates Nx's own inferred pattern exactly (`tsc --noEmit -p tsconfig.spec.json`) — verify the native pattern via `nx show project <native-typecheck-project> --json` on a project that does get one inferred, rather than inventing a shape.

Two gotchas when wiring this by hand:

- `nx.json`'s `targetDefaults` keys match by **target name**, not executor — a `targetDefaults.typecheck` block applies uniformly to every target literally named `typecheck`, whether manually declared or plugin-inferred, so cache config can be centralized once instead of duplicated per-project.
- The `production` named input excludes spec files and `tsconfig.spec.json` — a target that typechecks against `tsconfig.spec.json` must use `"default"` (which includes spec files) in its cache `inputs`, or the cache will hide changes to the very files being checked.

### `includedScripts` (hiding npm scripts from Nx/NX Console) belongs in `package.json`, not `project.json`

Any per-project Nx option must validate against `project-schema.json` — if it doesn't, grep for it in `node_modules/nx/dist` before assuming it works rather than being silently ignored. A top-level `"includedScripts": []` in `project.json` silently does nothing if that key doesn't exist in `project-schema.json`; Nx core's actual reader (`readTargetsFromPackageJson`) only checks `packageJson.nx?.includedScripts`, falling back to all `Object.keys(scripts)` when absent. Fix: move the key into `package.json`'s own `"nx"` block. `nx.json` is workspace-global (target defaults, input globs, inference-plugin registration) and never carries per-project data like which scripts to expose.

## 7. A green build does not close the task

`nx build` exiting 0 proves compilation, not correctness. The quality gate (`tester` + `reviewer`, see `rules/workflow.md`) still runs. Advance to Phase 4 — do not declare the task done.
