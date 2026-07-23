---
name: cts-import-skill
description: "Maintainer flow for importing an external skill (GitHub URL, owner/repo/path, or local path) into CTS's curated `.claude/skills/`: fetches the source, runs a blocking duplication check against every existing skill (merge/replace/reject/import-as-is), brings the description and body up to CTS's skill-quality bar (what+when description, explicit NOT-for, EN/UA triggers, no placeholders), then updates README, THIRD_PARTY.md, and CHANGELOG.md. NOT for installing skills into consumer projects (those receive skills via /cts-update) and NOT for editing application source code.\n\nTrigger — EN: cts-import-skill, import skill, add external skill, curate skill, new skill from repo.\nTrigger — UA: імпортувати скіл, додати скіл, новий скіл з репозиторію, курація скілів, перевірити дублікати."
---

# /cts-import-skill

Invocation: `/cts-import-skill <github-url | owner/repo/path | local-path>`. This is **maintainer-side**: it curates the skills that ship _inside_ CTS itself, not skills installed into a consumer project (that's `/cts-update`'s job via the payload).

## 1. Guard

Verify the current working directory is the CTS repo itself:

- `cts-payload.txt` exists at the repo root, **and**
- `git remote get-url origin` matches `claude-ts` (any owner/fork).

If either check fails, stop and tell the user: "This is a CTS-maintainer skill — run it inside the `claude-ts` repo, not a consumer project."

## 2. Fetch

Obtain the skill source:

- **GitHub URL / `owner/repo/path`**: fetch the raw `SKILL.md` plus any `references/`, `examples/`, or scripts under the same directory.
- **Local path**: read directly.

Show the user the skill's `name` and `description` from its frontmatter before proceeding — this is the basis for the duplication check.

## 3. Duplication check (blocking)

Compare the imported skill's name and description against:

- every `.claude/skills/*/SKILL.md` name + description, **and**
- the `## Skills` section of `THIRD_PARTY.md` (catches a skill already imported under a different local name).

For each overlap found, recommend one of:

- **merge** — fold the unique parts of the imported skill into the existing one (e.g. the Postgres fold-in: one skill absorbs another's references).
- **replace** — the imported skill is clearly superior; swap it in, update `THIRD_PARTY.md` attribution.
- **reject** — adds nothing over what's already covered; do not import.
- **import as-is** — genuinely new territory, no overlap.

If the case is clear-cut (e.g. identical `name` already present, or `THIRD_PARTY.md` shows this exact source was imported before), state the recommendation directly. Otherwise, use `AskUserQuestion` with the overlap summary and the four options above.

If the result is **reject**, stop here and report (step 7) without touching any files.

## 4. Quality pass

Bring the `description` field up to CTS's bar:

- 1–2 sentences covering **what** the skill does and **when** to use it.
- An explicit **NOT for** clause distinguishing it from adjacent skills/agents.
- EN trigger keywords, plus 4–5 of the **strongest** UA trigger keywords (not a literal translation of every EN term).
- No placeholder descriptions ("X Expert", "Helps with Y").

Rewrite the description if it falls short. Check the body for:

- **Progressive disclosure** — `SKILL.md` itself stays small; detail belongs in `references/`, `examples/`, or linked files.
- **No unnecessary vendor lock** — strip references to tools/services the skill doesn't actually need.
- **No conflicting stack assumptions** — CTS is Node.js/TypeScript; a skill assuming PHP/Laravel/Python tooling needs those parts removed or generalized (CTS previously had to strip Laravel/PHP-specific reference files and CI config that had been pulled in this way).

## 5. Stack fit

- Strip or adapt any examples, configs, or commands tied to a stack CTS doesn't use.
- Flag anything requiring runtime dependencies (npm packages, scripts that need installing) — CTS prefers dependency-free skills. If unavoidable, note it prominently in the integration report so the user can decide.

## 6. Integrate

For **import as-is** or **merge/replace** outcomes:

1. Copy the (adapted) skill into `.claude/skills/<name>/` (including `references/`, `examples/`, etc.).
2. Add it to the README skills inventory table (`### Skills (N)` — bump the count and pick the right category, or add one).
3. Add an entry to `THIRD_PARTY.md` under `## Skills`: source repo URL, original file path, author, license — **check the license permits redistribution**; if missing or unclear, warn the user instead of importing silently.
4. If the source repo isn't already listed under README's `## License` → "Third-party attributions" list, add it there too (`<repo-url> (<license>)`), so the top-level attribution stays in sync with `THIRD_PARTY.md`.
5. If the skill should be wired into any agent's `## Skills to Activate` table, grep that table first for an existing row already covering the same functionality under a different name or alias — add the new row only if none exists; otherwise fold the reference into the existing row instead of duplicating it.
6. Add a `CHANGELOG.md` entry under `[Unreleased]`.

Payload coverage is automatic — `.claude/skills/` is already in `cts-payload.txt`, so no script changes are needed.

## 7. Report

Summary table with one row per skill considered: `imported` / `merged-into <target>` / `replaced <target>` / `rejected` + a one-line reason for each.

Remind the user: review `git diff`, then commit themselves — this skill never commits or pushes.
