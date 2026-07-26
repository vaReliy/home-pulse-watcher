# Docs Style: No Manual Prose Wrapping

Applies to every `.md` file in this repo: `docs/**`, `rules/**`, `README.md`, `CLAUDE.md`, `AGENTS.md`, task files, `CHANGELOG.md`, and generated PR/issue bodies.

## The rule

Never manually hard-wrap prose at 80/100/120 columns. Markdown viewers (GitHub, editors, rendered docs) already soft-wrap prose to the reading width — manual line breaks inside a paragraph add nothing there, and actively break rendering in contexts that treat a single newline as a hard line break (raw diffs, some terminal viewers, some non-CommonMark renderers).

## The mechanism: Prettier, not memory

**For consumer projects:** This is enforced by tooling, not by agents remembering a convention. Set `.prettierrc` with `"proseWrap": "never"`, and run `.md` files through `prettier --write` on every commit via a git hook (typically `lint-staged` with a `*.md` pattern in the config). If you use VS Code with "format on save" and the Prettier extension, you get the identical result live, since it reads the same `.prettierrc`.

**For CTS (this repo):** Prettier is run manually or in CI; there is no automated git hook here. Format the file before committing: `pnpm exec prettier --write <path>`.

Practical effect: don't worry about wrapping while writing or editing a `.md` file — write normal prose, save, and Prettier collapses every paragraph (including multi-line list-item text) to one line automatically. There is nothing to remember or self-police.

## The one authoring gotcha: blank lines before structural elements

Prettier's markdown parser needs a blank line before a table, or before a distinct labeled line that should stay visually separate (e.g. two different `**Bold Label:**` metadata lines in a row). Without a blank line, it treats the whole block as one paragraph and merges it into a single line — for a table, this silently destroys the table syntax; for two adjacent bold-label lines, it silently glues them together into one confusing line.

Rule of thumb: always put a blank line before a table, and before any standalone bold-label line that is logically distinct from the line above it. This is caught in this repo — e.g., `rules/cts/workflow.md`'s "Frontend agent selection" table requires a blank line before it — and the same rule applies in every project's `.md` files.

## What Prettier already knows to leave alone

No need to think about these — Prettier's markdown parser handles them correctly as long as blank lines are used per the gotcha above:

- List items — each item's own line; item text collapses to one line but items don't merge into each other.
- Tables — one row per line (given the blank line above the table).
- Code fences — exact line breaks preserved, never reflowed.
- YAML frontmatter — one key per line.
- Blockquotes — same one-line-per-paragraph rule applies inside the quote.

## Mermaid diagrams: `#` is an escape prefix, not a literal

Mermaid treats `#` as the start of an HTML entity code (`#quot;`, `#35;`), including inside quoted node and edge labels. A label that quotes a markdown heading — `-->|"## Fix Now items"|` — is therefore a rendering hazard, and it fails at render time on GitHub rather than at authoring time.

Write the text without the `#` (`-->|"Fix Now items"|`), or use the numeric escape `#35;` when the character is genuinely required. Same caution applies to `<`, `>`, and `"` inside labels; prefer `<br/>` for intentional line breaks, which Mermaid does honour in quoted labels.

**Anchor edges to nodes, never to a subgraph.** An edge written from a subgraph id (`QG -->|"label"| X`) leaves from the subgraph's boundary, so two edges out of the same subgraph get near-identical geometry and their labels render stacked on top of each other — often with an adjacent node buried underneath. Point the edge at the actual node the flow leaves from (`PAR -->|"label"| X`) instead. Give each outgoing edge its own labeled line rather than chaining (`A -->|"l"| B --> C`), so the layout engine can separate them.

Diagrams are preferred over binary images in this repo: they diff, they render natively on GitHub and in Artifacts, and they never become orphaned files that outlive whatever referenced them.

Always render-check a diagram before committing — a Markdown preview (VS Code, GitHub) is the only reliable verification. Both gotchas above fail at render time, not at authoring time, so they are invisible in the source.

## Committed files never cite task files or decision IDs

`tasks/` is **gitignored**. Task files are working scratch — renamed, archived, and deleted freely, and never present in a clone at all. So a citation like `tasks/todo/<date>-<nn>-<slug>.md`, a bare task slug, a sequence number, or a decision ID (`D9`, "session 03") inside any committed file is a pointer to content the reader does not have and cannot obtain. It is dangling on the day it is written, not merely stale later.

This applies to every tracked file — `CHANGELOG.md`, `README.md`, `rules/**`, `.claude/**`, agent and skill bodies, and code comments alike (`AGENTS.md` § Code Style Essentials states the code-comment half of the same rule).

Write what changed and why instead, and cross-reference only by things a clone can resolve:

- **commit SHA** — `fixed in 6ce4728`
- **file path** — `.claude/scripts/cts-sync.sh`'s `merge_one`
- **the changelog's own entry titles** — "see the naming-unification entry below"
- **a content-level description of the work** — "the pending blanket rollout", "the two-layer distribution refactor"

The one legitimate exception is generic, illustrative filenames in documentation that teaches the task workflow itself (`rules/cts/task-authoring.md`'s naming examples, `docs/USAGE.md`'s recipe commands). Those are placeholders demonstrating a format, not citations of a real work item.

## Verifying

**For consumer projects:** Run `pnpm exec prettier --check '<path>'` (or `--write` to fix) — same command your lint-staged hook uses. Reference any existing `docs/**/*.md` file or a `rules/` file in your project for the target shape.

**For CTS:** Run `pnpm exec prettier --check '<path>'` (or `--write` to fix) before committing.
