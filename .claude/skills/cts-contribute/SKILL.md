---
name: cts-contribute
description: "Consumer-side flow for contributing improvements back to the CTS template. Diffs the current project against its CTS checkout, classifies changes into three cases (net-new skills, CTS-managed file edits, .ctsignore'd fork improvements), confirms each as a whole-file copy (no hunk editing — single ownership means the consumer's file already IS the proposed replacement), then writes accepted files to the local CTS repo and updates both changelogs. NOT for first-time installs (cts-setup), upstream sync (cts-update), or importing external third-party skills into CTS (cts-import-skill).\n\nTrigger — EN: cts-contribute, export to CTS, contribute back, push improvements upstream, share with CTS, export skill to template.\nTrigger — UA: експортувати до CTS, поділитися з CTS, зворотній експорт, contribute до шаблону, передати зміни в CTS."
---

# /cts-contribute

Guides a consumer project through contributing its improvements back to a local CTS checkout. Run from inside the consumer project (e.g. `penny`, `hpw`). Make **no writes** to CTS until Step 5 — all decisions are collected first.

Two-layer distribution model: contribution is always a **whole-file copy**, never a hunk merge. Under single ownership, a CTS-owned file the consumer edited (an ownership violation `cts-sync.sh` already warned about) is, by definition, either the whole proposed replacement or not worth contributing — there is no partial-hunk state to negotiate, because the file was never merged into pieces in the first place. This is also why the round trip is a no-op by construction: `/cts-update` afterward overwrites the consumer's copy with byte-identical content.

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

### Case B — CTS-managed file edits

For each payload file listed in `cts-payload.txt` that is **not** in `.ctsignore`, diff the consumer's copy against CTS:

```
diff <(cat <consumer-file>) <(cat <cts-path>/<file>)
```

If a diff exists, this is a CTS-owned file the consumer edited directly instead of through an override file — `cts-sync.sh update` will already have printed an `OWNERSHIP WARNING` for it on the most recent sync (check the captured output or `git log` for that line if unsure). Queue the consumer's current content as a whole-file replacement candidate.

### Case C — `.ctsignore`'d fork improvements

For each path in `.ctsignore` that also exists in CTS, diff consumer vs. CTS. Pre-filter:

- **Auto-skip (project-specific signals)**: the file is a deliberate whole-file fork for project-specific reasons (stack names, app names, domain terms tied to this project). Log as "skipped — project-specific fork."
- **Queue for review**: the fork looks like a general improvement that would also help other consumers.

Also check `docs/CLAUDE_TS_CHANGELOG.md` if it exists — its entries describe what changed since the last CTS sync, making it the primary extraction guide. Mention it to the user at the start of Case C review.

Note: under the two-layer model, most customization goes through an override file (`rules/local/**`, `.claude/agents-local/<name>.md`, `AGENTS.local.md`, `CLAUDE.local.md`) instead of `.ctsignore`-ing a whole CTS file — those override files are consumer-owned by design and are never contribution candidates themselves (there's nothing to "merge back"; if an override's replacement text is broadly useful, propose editing the CTS file it cites directly instead, which routes through Case B on a later run). Case C should mostly surface genuinely forked files.

---

## 3. Report discovery, confirm before proceeding

Print a summary table:

| Category                     | Count | Action                         |
| ----------------------------- | ----- | ------------------------------- |
| Net-new skills (Case A)       | N     | Will export                     |
| CTS-managed edits (Case B)    | N     | Whole-file replacement candidate |
| Forked-file improvements (Case C) | N | Whole-file replacement candidate |
| Skipped (project-specific)    | N     | Will skip (escape hatch below)  |

Ask: "Proceed with review?" If the user wants to re-examine any skipped item, they can say so now — add it back to the queue.

---

## 4. Review

Work through the queue one item at a time. For each:

**Format:**

```
── [Case A / B / C] ── <file or skill name> ──
<diff or description>

Suggested: EXPORT / SKIP
Reason: <one-line classification rationale>

Your decision? [export / skip]
```

- **export**: the consumer's current file content is queued for write to CTS, verbatim, as a whole-file replacement — no hunk editing. If the content still contains project-specific wording that shouldn't ship to every consumer, say so now and ask the user to fix the wording IN THE CONSUMER'S OWN FILE first (this keeps the consumer's copy and the CTS copy byte-identical after the round trip, per the no-op guarantee — editing only at export time would reintroduce the divergence `/cts-update` would immediately re-flag as an ownership violation next sync).
- **skip**: drop from export.

For Case A (net-new skills), show the skill's `name` and `description` frontmatter and ask if it should be contributed as-is or stripped of project-specific content first (same rule: fix it in the consumer's own copy, not just at export time).

Continue until all queued items are resolved.

---

## 5. Write to CTS

Only after all decisions are confirmed — write nothing before this step.

For each accepted item, copy the whole file:

- **Case A skills**: `.claude/skills/<name>/` → `<cts-path>/.claude/skills/<name>/`. If a same-named skill already exists (shouldn't, but guard), stop and ask.
- **Case B / C files**: the consumer's current file content → the corresponding path in `<cts-path>`.

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
  4. Run /cts-update here — this is a no-op by construction: the file you
     just exported is already byte-identical to what CTS now ships, so the
     next sync writes the same bytes back. You may still see one final
     OWNERSHIP WARNING on that run if this was the first sync since the
     edit was made (the warning fires on divergence from the LAST recorded
     sync, not on divergence from upstream) — that's expected, not an error.
────────────────────────────────────────────────────────
```

Never commit or push. The user reviews `git diff` in CTS and commits themselves.
