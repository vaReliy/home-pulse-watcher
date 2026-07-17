---
name: cts-contribute
description: "Consumer-side flow for contributing improvements back to the CTS template. Diffs the current project against its CTS baseline, classifies changes into three cases (net-new skills, CTS-managed file edits, .ctsignore'd file improvements), interactively guides hunk-level decisions for overridden files, then writes accepted changes to the local CTS repo and updates both changelogs. NOT for first-time installs (cts-setup), upstream sync (cts-update), or importing external third-party skills into CTS (cts-import-skill).\n\nTrigger — EN: cts-contribute, export to CTS, contribute back, push improvements upstream, share with CTS, export skill to template.\nTrigger — UA: експортувати до CTS, поділитися з CTS, зворотній експорт, contribute до шаблону, передати зміни в CTS."
---

# /cts-contribute

Guides a consumer project through contributing its improvements back to a local CTS checkout. Run from inside the consumer project (e.g. `penny`, `hpw`). Make **no writes** to CTS until Step 5 — all decisions are collected first.

## 1. Pre-flight (four hard blocks — fail fast, fail loud)

Run all four checks before doing anything else:

**a. Consumer identity** `.cts-version` must exist. If missing: "This project was not installed via cts-sync.sh — `/cts-contribute` cannot run here."

**b. CTS target** Resolve the CTS path: `../claude-ts` by default, or the path the user passed. If the directory exists, verify it looks like a CTS repo (`cts-payload.txt` present). If the directory does **not** exist, create it as an empty patch folder and skip the sync-check below — the user is building a patch, not writing to a live CTS. Report: "CTS not found at `<path>` — creating patch folder."

**c. Sync alignment** (skip if patch-folder mode from b) Read `.cts-version` (the consumer's pinned CTS commit). Run `git -C <cts-path> rev-parse HEAD`. If they differ: "Your project is N commits behind CTS HEAD. Run `/cts-update` first, then re-run `/cts-contribute`." Hard stop.

**d. Knowledge inbox** Read `docs/KNOWLEDGE_INBOX.md`. Scan all Category C entries (containing `Belongs in (guess):`) and check if any have crossed the stale gate from `distill-inbox` Step 1a (entry `age_days >= 14` AND `commits_since >= 5` — compute these values as described there). If stale unresolved entries exist, prompt: "Inbox has unresolved guess notes older than 14 days / 5+ commits — run `/distill-inbox` first to resolve them, or confirm you want to proceed with them still open." Wait for confirmation before continuing. Entries younger than the gate are fine to leave alone; do not block on them.

---

## 2. Discover candidates

Scan three cases in parallel and build a candidate list — no user interaction yet.

### Case A — Net-new skills

List every directory in `.claude/skills/` that does **not** exist in `<cts-path>/.claude/skills/`. These are new skills the consumer created. Auto-queue all for export.

### Case B — CTS-managed file changes

For each file in `cts-payload.txt` that is **not** in `.ctsignore`, diff the consumer's copy against CTS:

```
diff <(cat <consumer-file>) <(cat <cts-path>/<file>)
```

If a diff exists, flag it — a CTS-managed file was edited outside the sync flow. These are unusual and need explicit review.

### Case C — `.ctsignore`'d file improvements

For each path in `.ctsignore` that also exists in CTS, diff consumer vs. CTS. Pre-filter hunks:

- **Auto-skip (project-specific signals)**: hunk contains stack names, app names, domain terms, file paths, or language identifiers tied to this project (e.g. `MongoDB`, `Mongoose`, `Typegoose`, `Telegram`, `Angular` when paired with project-specific routing, `NestJS` module names, repo-specific paths). Log as "skipped — project-specific."
- **Queue for review**: all remaining hunks where the change looks like a general workflow rule, quality gate, orchestrator improvement, or skill update.

Also check `docs/CLAUDE_TS_CHANGELOG.md` if it exists — its entries describe what changed since the last CTS sync, making it the primary extraction guide. Mention it to the user at the start of Case C review.

---

## 3. Report discovery, confirm before proceeding

Print a summary table:

| Category                   | Count | Action                         |
| -------------------------- | ----- | ------------------------------ |
| Net-new skills (Case A)    | N     | Will export                    |
| CTS-managed edits (Case B) | N     | Needs review                   |
| Improvement hunks (Case C) | N     | Interactive review             |
| Skipped (project-specific) | N     | Will skip (escape hatch below) |

Ask: "Proceed with interactive review?" If the user wants to re-examine any skipped hunk, they can say so now — add it back to the queue.

---

## 4. Interactive review

Work through the queue one item at a time. For each:

**Format:**

```
── [Case A / B / C] ── <file or skill name> ──
<diff or description>

Suggested: EXPORT / SKIP
Reason: <one-line classification rationale>

Your decision? [export / skip / edit before export]
```

- **export**: accept as-is, queue for write.
- **skip**: drop from export.
- **edit before export**: show the hunk, let the user dictate the cleaned version (strip project-specific parts), then queue the edited version. Note: this path only writes the edited text into CTS (Step 5) — it does **not** update the consumer's own copy of the file, which keeps its original wording. The next `/cts-update` here will therefore not be a no-op on that hunk, though the signal differs by case: for **Case B** (CTS-managed, not `.ctsignore`'d) it produces a real `CONFLICT:` (base/local/upstream are three genuinely different texts); for **Case C** (`.ctsignore`'d) the file is never eligible for merge or `CONFLICT:` at all — the engine checks `.ctsignore` before the merge path — so it instead surfaces as `ignored, but changed upstream — review manually`. That's expected — see Step 7.

For Case A (net-new skills), show the skill's `name` and `description` frontmatter and ask if it should be contributed as-is or stripped of project-specific content first.

Continue until all queued items are resolved.

---

## 5. Write to CTS

Only after all decisions are confirmed — write nothing before this step.

For each accepted item:

- **Case A skills**: copy `.claude/skills/<name>/` → `<cts-path>/.claude/skills/<name>/`. If a same-named skill already exists (shouldn't, but guard), stop and ask.
- **Case B / C hunks**: apply the accepted hunks to the corresponding CTS file using the edited content collected in Step 4.

Report each write: `✓ wrote <path>`.

---

## 6. Update changelogs

**CTS `CHANGELOG.md`** — add under `## [Unreleased]`:

```markdown
## [Unreleased] — Contributed from <consumer-project-name>

### Added / Changed / Fixed

- **`<file-or-skill>`**: <one-line description of what was contributed>
```

One bullet per contributed item. Use the standard Added/Changed/Fixed grouping.

**Consumer `docs/CLAUDE_TS_CHANGELOG.md`** — distill post-export: Show the current file. For each entry, ask: "Was this contributed to CTS just now, or is it still pending / project-specific?" Remove contributed entries, keep the rest. If the file ends up empty (or only a header), say so — that's a healthy state.

---

## 7. Summary

Print a final report:

```
── cts-contribute summary ──────────────────────────────
Contributed to <cts-path>:
  ✓ <list of exported items>

Skipped:
  · <list of skipped items with reason>

CTS CHANGELOG: updated
Consumer CLAUDE_TS_CHANGELOG: N entries removed, M remain

Next steps:
  1. cd <cts-path> && git diff   ← review before committing
  2. Commit and push CTS when satisfied
  3. Run /cts-update in other consumer projects (e.g. HPW) to receive changes
  4. Run /cts-update here — not a no-op for any hunk you edited-before-
     export: on CTS-managed (Case B) files it shows CONFLICT:, on
     .ctsignore'd (Case C) files it shows "ignored, but changed
     upstream" instead (that path never produces CONFLICT:). Either
     way the correct resolution is almost always "take upstream" /
     "remove from .ctsignore," since upstream now holds your own
     contribution in its generalized form (see cts-update's round-trip
     triage note)
────────────────────────────────────────────────────────
```

Never commit or push. The user reviews `git diff` in CTS and commits themselves.
