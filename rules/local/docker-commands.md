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
