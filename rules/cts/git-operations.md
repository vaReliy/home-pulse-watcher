# Git & PR Rules

## Commit Rules

- **NEVER create commits automatically** — only commit when explicitly requested by the user
- **NEVER push to remote** without explicit user request
- **NEVER force push** or run destructive git commands without explicit approval
- When changes are ready, inform the user and wait for their instruction
- Always show `git diff` or `git status` to let the user review before committing

## Pull Request Descriptions

- **NEVER mention AI tools** (Claude, Copilot, Gemini, etc.) in PR title or body
- **NEVER include change statistics** (file count, lines added/removed)
- **NEVER add test plan checklists** — there is no QA team to execute them
- Keep PR descriptions focused on **what** changed and **why**

## Parallel Branches — Ledger Merge Strategy

The workflow's append-only ledgers are all written the same way: every branch appends at EOF (or into the same `## [Unreleased]` region). Under a normal 3-way merge that guarantees a conflict on every cross-branch merge, on files whose content is by construction non-conflicting — two branches learned two different things.

These four paths therefore carry `merge=union` via a CTS-managed block in the repo-root `.gitattributes`:

| Path                          | Shape                            |
| ----------------------------- | -------------------------------- |
| `docs/KNOWLEDGE_INBOX.md`     | 3-line entries appended at EOF   |
| `docs/METRICS.md`             | one table row per completed task |
| `docs/CLAUDE_TS_CHANGELOG.md` | divergence entries               |
| `CHANGELOG.md`                | per-task entries                 |

`union` is a git **built-in** driver: it needs no `git config` in each clone, unlike a custom merge driver (which silently no-ops for anyone who skipped the setup step, producing conflicts that look like the feature was never installed). It resolves a conflicting hunk by keeping both sides' lines instead of writing conflict markers.

**The block is managed by `.claude/scripts/cts-sync.sh`** and re-asserted on every sync. `.gitattributes` itself is consumer-owned and is **not** a payload path — CTS owns only the delimited block inside it, appended last so it wins (last matching pattern wins in `.gitattributes`). Put your own rules outside the markers; edits inside them are overwritten.

### When union needs a follow-up

Union never conflicts, which is also its one failure mode. Two cases to know:

- **Resurrected entries.** Merging a branch that _deleted_ inbox entries (a distillation) against a branch that _appended_ can bring the deleted lines back — union keeps both sides. This is recoverable noise, not data loss: re-run `/distill-inbox` after such a merge and the entries go back to their permanent homes. Distill on a branch that is about to merge, not one that will sit for a week.
- **Missing blank line between entries.** Concatenating two appended hunks can drop the blank line separating them. Harmless — Prettier restores it on the next format pass (see `rules/cts/docs-style.md`).

Never resolve a ledger conflict by picking one side. If you ever do see conflict markers in these files (a repo predating the block, or a rule ordering problem), the resolution is always **keep both sides**, in either order — then check the `.gitattributes` block is present and last.

## Session Safety

### Never `git stash`/`git stash pop` mid-session

Even a reversible `git stash`/`git stash pop` mid-session mutates the working tree that the user (or another agent) is actively tracking via `git diff` across turns. This disrupts the visible diff and is not necessary.

To check whether an issue predates the current session's changes, use non-mutating alternatives:

- `git show HEAD:<path>` — check a single file at HEAD
- `git diff HEAD -- <path>` — diff a file against HEAD
- `git worktree add` — create a genuinely separate checkout for comparison
- `git log`/`git blame` — reason from commit history instead
