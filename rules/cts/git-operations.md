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

## Session Safety

### Never `git stash`/`git stash pop` mid-session

Even a reversible `git stash`/`git stash pop` mid-session mutates the working tree that the user (or another agent) is actively tracking via `git diff` across turns. This disrupts the visible diff and is not necessary.

To check whether an issue predates the current session's changes, use non-mutating alternatives:

- `git show HEAD:<path>` — check a single file at HEAD
- `git diff HEAD -- <path>` — diff a file against HEAD
- `git worktree add` — create a genuinely separate checkout for comparison
- `git log`/`git blame` — reason from commit history instead
