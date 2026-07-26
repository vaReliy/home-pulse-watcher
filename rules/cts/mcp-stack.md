# MCP Stack — Tool Usage Guide

## Context7 (Library Documentation)

| Tool                 | When to Use                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `resolve-library-id` | Find library ID before querying                                                            |
| `query-docs`         | Vue 3, React, Angular, Pinia, Prisma, BullMQ, NestJS, and other Node.js/frontend libraries |

## GitHub MCP

| Tool                        | When to Use                        |
| --------------------------- | ---------------------------------- |
| `pull_request_read`         | Read PR details for review         |
| `create_pull_request`       | Create PR (docs-writer agent only) |
| `pull_request_review_write` | Post inline review comments        |
| `list_pull_requests`        | List open PRs                      |

## Figma MCP

| Tool                    | When to Use                         |
| ----------------------- | ----------------------------------- |
| `get_figma_data`        | Inspect designs before implementing |
| `download_figma_images` | Download design assets              |

## Playwright MCP

Used exclusively by the `qa` agent for E2E browser automation.

**Not provided by `.mcp.json`.** Unlike Context7/GitHub/Figma above, the Playwright tools are namespaced `mcp__plugin_playwright_playwright__*` — they come from a separately installed Claude Code **plugin**, not from this repo's `.mcp.json`. If that plugin isn't installed, every tool in `qa`'s frontmatter is inert and `qa` cannot run.

| Tool                                                   | When to Use                           |
| ------------------------------------------------------ | ------------------------------------- |
| `browser_navigate`, `browser_snapshot`                 | Load a page and capture its state     |
| `browser_click`, `browser_type`, `browser_fill_form`   | Drive the user flow under test        |
| `browser_take_screenshot`                              | Visual regression comparison          |
| `browser_console_messages`, `browser_network_requests` | Diagnose failures from the page side  |
| `browser_wait_for`                                     | Synchronize on async UI (never sleep) |

## IDE MCP

`mcp__ide__getDiagnostics` (used by `backend-developer` and the frontend agents) is provided by the Claude Code **IDE extension**, not by `.mcp.json`. Without the extension, fall back to the project's own type-check target — see AGENTS.md § Verification Commands.
