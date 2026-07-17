---
name: github-actions
description: >-
  This skill should be used when the user asks to "create a GitHub Actions workflow", "set up CI/CD pipeline", "add GitHub Actions", "configure CI", "create reusable workflow", "add composite action", "fix failing workflow", "optimize GitHub Actions", "add caching to CI", "set up deployment pipeline", "add tests to CI", "create Docker build workflow", or mentions GitHub Actions, CI/CD, workflow YAML, or .github/workflows. Covers JavaScript, TypeScript, Node.js, SQL, and Docker-based pipelines. Українською: GitHub Actions, CI/CD пайплайн, налаштувати CI, створити workflow, оптимізувати пайплайн, додати тести в CI, створити деплой, кешування в CI, виправити workflow, композитна дія.
---

# GitHub Actions Expert

Expert guidance for creating, optimizing, and maintaining GitHub Actions workflows across JavaScript/TypeScript and Docker-based projects.

## Workflow Design Principles

- One responsibility per workflow file
- Fail fast — quick checks (lint, format) before slow ones (tests, build, deploy)
- Cache aggressively — dependencies, Docker layers, build artifacts
- Pin actions to full SHA for supply chain security
- Set `timeout-minutes` on every job
- Use `concurrency` groups to cancel redundant runs
- Use `workflow_dispatch` for manual triggers with parameters
- Restrict `permissions:` to minimum required scope

## Core Patterns

### Concurrency Control

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### Matrix Strategy

```yaml
strategy:
  fail-fast: true
  matrix:
    include:
      - { os: ubuntu-latest, version: '8.4' }
      - { os: ubuntu-latest, version: '8.3' }
```

### Path Filtering

```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'tests/**'
      - '.github/workflows/ci.yml'
```

### Conditional Execution

```yaml
if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

### `on.branches` silently skips the entire job on non-matching branches

When adding a new workflow, or adding CI coverage for a new branch, always verify the current branch is in the `on.branches` allow-list. A mismatch is fully silent — the job simply doesn't appear in the GitHub Actions UI for that branch, with no error or warning surfaced anywhere. This is easy to misdiagnose as a YAML syntax error or a workflow that "isn't running" for some other reason; check `on.branches` (or `on.push.branches` / `on.pull_request.branches`) first before a longer debugging pass.

## Secrets and Security

- Never hardcode secrets — use `${{ secrets.NAME }}`
- Pin actions to commit SHA: `uses: actions/checkout@a5ac7e51b41094c92402da3b24376905380afc29 # v4`
- Use OIDC for cloud deployments instead of long-lived credentials
- Use environments with protection rules for production
- Restrict GITHUB_TOKEN permissions per job:

```yaml
permissions:
  contents: read
  pull-requests: write
```

## Caching Strategies

### npm / Node.js

```yaml
- uses: actions/cache@v4
  with:
    path: node_modules
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
```

### Docker Layer Cache

```yaml
- uses: docker/build-push-action@v6
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

## Service Containers

```yaml
services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_DB: testing
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports: ['5432:5432']
    options: >-
      --health-cmd="pg_isready" --health-interval=10s --health-timeout=5s --health-retries=3


  redis:
    image: redis:7
    ports: ['6379:6379']
    options: >-
      --health-cmd="redis-cli ping" --health-interval=10s --health-timeout=5s --health-retries=3
```

## Reusable Workflows

```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:
    inputs:
      version:
        type: string
        required: true
    secrets:
      token:
        required: false
```

Call from another workflow:

```yaml
jobs:
  test:
    uses: ./.github/workflows/reusable-test.yml
    with:
      version: '8.4'
    secrets: inherit
```

## Composite Actions

Create reusable step groups in `.github/actions/`:

```yaml
# .github/actions/setup-app/action.yml
name: Setup Application
inputs:
  runtime-version:
    default: '8.4'
runs:
  using: composite
  steps:
    - run: echo "Setting up with ${{ inputs.runtime-version }}"
      shell: bash
```

## Optimization Tips

- Run linters and static analysis in parallel as separate jobs
- Use `continue-on-error: true` only for non-blocking checks
- Upload artifacts (coverage, logs) on failure with `if: failure()`
- Use `paths` and `paths-ignore` to skip unnecessary runs
- Consider `actions/upload-artifact` + `actions/download-artifact` for cross-job data

## Additional Resources

### Reference Files

For stack-specific workflow templates and advanced patterns:

- **`references/node-workflows.md`** — Node.js, TypeScript, JavaScript CI patterns
- **`references/advanced-patterns.md`** — OIDC deployments, Docker multi-stage builds, monorepo strategies, environment promotion

### Example Files

Working examples in `examples/`:

- **`examples/node-ci.yml`** — Node.js/TypeScript lint + test + build
- **`examples/docker-deploy.yml`** — Docker build, push, and deploy
