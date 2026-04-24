# MCP Stack — Tool Usage Guide

## Context7 (Library Documentation)

| Tool | When to Use |
|------|-------------|
| `resolve-library-id` | Find library ID before querying |
| `query-docs` | Vue 3, React, Angular, Pinia, Prisma, BullMQ, NestJS, and other Node.js/frontend libraries |

## GitHub MCP

| Tool | When to Use |
|------|-------------|
| `pull_request_read` | Read PR details for review |
| `create_pull_request` | Create PR (docs-writer agent only) |
| `pull_request_review_write` | Post inline review comments |
| `list_pull_requests` | List open PRs |

## Figma MCP

| Tool | When to Use |
|------|-------------|
| `get_figma_data` | Inspect designs before implementing |
| `download_figma_images` | Download design assets |

## Playwright MCP

Used exclusively by `qa` agent for E2E browser automation.
