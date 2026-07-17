# Docs Style: No Manual Prose Wrapping

Applies to every `.md` file in this repo: `docs/**`, `rules/**`, `README.md`, `CLAUDE.md`, `AGENTS.md`, task files, `CHANGELOG.md`, and generated PR/issue bodies.

## The rule

Never manually hard-wrap prose at 80/100/120 columns. Markdown viewers (GitHub, editors, rendered docs) already soft-wrap prose to the reading width — manual line breaks inside a paragraph add nothing there, and actively break rendering in contexts that treat a single newline as a hard line break (raw diffs, some terminal viewers, some non-CommonMark renderers).

## The mechanism: Prettier, not memory

This is enforced by tooling, not by agents remembering a convention. `.prettierrc` sets `"proseWrap": "never"`, and `.md` files already go through `prettier --write` on every commit via `lint-staged` (`lint-staged.config.mjs`). If you use VS Code with "format on save" and the Prettier extension, you get the identical result live, since it reads the same `.prettierrc`.

Practical effect: don't worry about wrapping while writing or editing a `.md` file — write normal prose, save/commit, and Prettier collapses every paragraph (including multi-line list-item text) to one line automatically. There is nothing to remember or self-police.

## The one authoring gotcha: blank lines before structural elements

Prettier's markdown parser needs a blank line before a table, or before a distinct labeled line that should stay visually separate (e.g. two different `**Bold Label:**` metadata lines in a row). Without a blank line, it treats the whole block as one paragraph and merges it into a single line — for a table, this silently destroys the table syntax; for two adjacent bold-label lines, it silently glues them together into one confusing line.

Rule of thumb: always put a blank line before a table, and before any standalone bold-label line that is logically distinct from the line above it. This is caught twice in this repo already (`rules/workflow.md`'s "Frontend agent selection" table, `libs/identity/infrastructure/README.md`'s `**Tags**`/`**May import**` lines) — both were pre-existing missing-blank-line bugs that predate this rule, not something Prettier itself gets wrong.

## What Prettier already knows to leave alone

No need to think about these — Prettier's markdown parser handles them correctly as long as blank lines are used per the gotcha above:

- List items — each item's own line; item text collapses to one line but items don't merge into each other.
- Tables — one row per line (given the blank line above the table).
- Code fences — exact line breaks preserved, never reflowed.
- YAML frontmatter — one key per line.
- Blockquotes — same one-line-per-paragraph rule applies inside the quote.

## Verifying

`pnpm exec prettier --check '<path>'` (or `--write` to fix) — same command CI/lint-staged use. Reference `docs/SKELETON.md` and any `rules/*.md` file for the target shape.
