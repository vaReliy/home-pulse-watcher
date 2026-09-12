## Extends rules/cts/docker-commands.md — new section: Docker Cleanup

**Named images and containers must be cleaned up after task completion.**

Any Docker-based build/test task (e.g. `firmware/Dockerfile` builds via `scripts/firmware-docker-build.sh`) that explicitly names or tags images/containers must clean them up:

```bash
# After task completes, remove named artifacts:
docker rm -f <container-name> 2>/dev/null || true
docker rmi -f <image-name>:<tag> 2>/dev/null || true
```

For broader intermediate cleanup (dangling layers, unused builder cache), use **non-aggressive** prune commands:

```bash
# Safe cleanup — only unused images/builders:
docker image prune -f
docker builder prune -f
```

**NEVER run** `docker system prune -a --volumes` or `docker system prune -af --volumes` **without explicit user confirmation.** These commands:

- Destroy ALL unused images (including those from unrelated projects)
- Remove ALL named volumes (not just the current task's artifacts)
- Can fill the host disk to ENOSPC if intermediate images accumulate uncleaned
- Are unrecoverable once run

> **Rationale**: Full-system destructive cleanup removes cached layers and named volumes from other projects, not just the current one. Host disk fills when multi-stage Docker builds (e.g. PlatformIO + ESP-IDF) accumulate GBs of intermediate layers across repeated rebuilds. Always scope cleanup to the specific task's named artifacts first; broader prune only after user confirmation.

## Extends rules/cts/docker-commands.md — new section: Container Base Images

**Alpine `google/cloud-sdk:alpine` doesn't ship version-suffixed postgres client packages matching arbitrary Postgres majors.** Alpine repos are versioned per release and may not carry every major Postgres version's client package. For a Docker image needing both gcloud/gsutil AND a specific `pg_dump` version, prefer `google/cloud-sdk:slim` (Debian-based). Debian's unversioned metapackage `postgresql-client` resolves predictably to that release's default version, and `pg_dump` is safely forward-compatible (newer client dumping older server works; the reverse isn't guaranteed) — a Debian release shipping a newer default is acceptable.

## Extends rules/cts/docker-commands.md — new section: Container Users

**Debian's `nobody` user has `$HOME=/nonexistent` by design.** Any container step needing `nobody` to write files under its home dir (e.g. `gcloud auth activate-service-account`, which writes `~/.config/gcloud`) fails with "Permission denied" trying to create that directory. Fix: don't reuse `nobody` for anything that needs a writable home; create a dedicated non-root user with a real home dir instead (`useradd -m -s /bin/sh <name>` + `ENV HOME=/home/<name>`).

## Extends rules/cts/docker-commands.md — new section: Toolchain Build Layers and Disk Growth

**Building a toolchain-heavy project inside a `RUN` layer grows the disk by one image per build.** `firmware/Dockerfile` ran `pio run` in a plain `RUN`, baking the ~7.8GB PlatformIO toolchain into an image layer that sat _after_ the source `COPY` steps — so every source edit invalidated it, re-downloaded the toolchain, and produced another 7.8GB layer, while `-t name:latest` orphaned the previous image as a dangling `<none>`. Three builds filled a 96GB disk. Fix: `RUN --mount=type=cache,target=$PLATFORMIO_CORE_DIR` keeps the toolchain in BuildKit's shared cache instead of the image (needs `# syntax=docker/dockerfile:1`); image went 8GB → ~250MB. Two general rules: put expensive dependency fetches in a cache mount or a layer _before_ the source `COPY`, and have any script that rebuilds a fixed tag delete the image it just orphaned. Cleanup guidance for a dev machine must name `builder prune`/`image prune` and explicitly rule out `volume prune` — named volumes there hold local project databases.

## Extends rules/cts/docker-commands.md — new section: `docker run --rm` + Fixed `--name` Is Racy

The daemon removes an exited `--rm` container asynchronously and keeps its name registered briefly afterwards, so a rerun with the same fixed `--name` can fail with "container name is already in use" naming a container that `docker inspect` says does not exist. A `docker rm -f "$NAME" 2>/dev/null || true` guard cannot close the window: against a name mid-release it reports "no such container," which the silencing makes indistinguishable from success. Fix: keep the explicit name (useful — a hung build must be identifiable in `docker ps`) but suffix it with `$$` (the shell PID) for uniqueness per invocation, and separately reap any prefix-matching leftovers from older runs.

## Extends rules/cts/docker-commands.md — new section: Two Sequential `npm install` Calls Without a Lockfile

Two sequential `npm install` calls against the same `node_modules`/no-lockfile `package.json` can corrupt npm's dependency graph on Alpine. A production Dockerfile stage ran `npm install --omit=dev` then a second `npm install --no-save prisma dotenv` against the same tree — the second install's re-resolution over an already-partial tree crashed the build with `npm error Cannot read properties of null (reading 'edgesOut')` (an internal Arborist tree-node reference gone null), surfacing only in CI (a from-scratch two-pass install), not locally. Fix: `npm pkg set` to add the extra packages into the minimal `package.json`'s dependencies first, then a single `npm install --legacy-peer-deps` for one consistent resolution pass. General rule: any Dockerfile stage installing deps in two separate `npm install` steps without a committed lockfile is a latent trap — collapse to one install with the full dependency set.
