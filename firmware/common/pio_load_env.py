"""PlatformIO pre-build hook: supply PORTAL_AP_PASSWORD without shell exports.

Runs inside PlatformIO's own build (SCons), so it behaves identically for the
CLI, the IDE's Build / Upload / Upload and Monitor buttons, and the Docker
release image. `${sysenv.X}` could not do this: it reads the environment of the
`pio` process, which for the IDE buttons is whatever the editor inherited at
launch — not the user's current shell.

Resolution order:
  1. PORTAL_AP_PASSWORD already in the environment (Docker build-arg, CI, or a
     one-off `PORTAL_AP_PASSWORD=x pio run`) — always wins.
  2. HPW_PORTAL_AP_PASSWORD in the gitignored repo-root .env (local dev).

When neither is present no macro is defined, and portal.h's static_assert fails
the build with an actionable message rather than shipping an open AP.

Lives in firmware/common/ because that is one of the few directories the
firmware Dockerfile copies into the image; ../common/ resolves identically in
the local tree and at /build inside the container.
"""

Import("env")  # noqa: F821 — injected by SCons

import os
from pathlib import Path

BUILD_MACRO = "PORTAL_AP_PASSWORD"
DOTENV_KEY = "HPW_PORTAL_AP_PASSWORD"


def _read_from_dotenv(path):
    """Minimal KEY=VALUE reader — avoids a python-dotenv dependency in the
    PlatformIO core environment, which is not managed by this repo."""
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith(f"{DOTENV_KEY}="):
            continue
        return line.split("=", 1)[1].strip().strip("\"'")
    return None


def _resolve():
    from_env = os.environ.get(BUILD_MACRO)
    if from_env:
        return from_env, "environment"

    repo_root = Path(env.subst("$PROJECT_DIR")).resolve().parent.parent  # noqa: F821
    value = _read_from_dotenv(repo_root / ".env")
    if value:
        return value, f"{repo_root / '.env'}"
    return None, None


value, source = _resolve()

if value:
    env.Append(CPPDEFINES=[(BUILD_MACRO, env.StringifyMacro(value))])  # noqa: F821
    print(f"[hpw] {BUILD_MACRO} loaded from {source} ({len(value)} chars)")
else:
    print(
        f"[hpw] {BUILD_MACRO} not set — checked the environment and the "
        f"repo-root .env ({DOTENV_KEY}=). The build will fail in portal.h."
    )
