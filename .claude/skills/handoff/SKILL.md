---
name: handoff
description: >-
  Compact the current conversation into a handoff document so a fresh agent session can pick up the work with full context. Use when a session is about to end mid-task, before a context-window compaction would lose nuance, or when the orchestrator's quality-gate cycle limit is hit and a continuation task must survive into a new session. NOT for routine task tracking within a single session (use `TaskCreate`/`TaskUpdate`) and NOT for durable cross-session project knowledge (that belongs in `docs/KNOWLEDGE_INBOX.md` or auto-memory).
  
  Українською: передати роботу іншому агенту, стиснути розмову, документ передачі, продовжити в новій сесії, зберегти контекст перед завершенням.
---

# Handoff

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to the temporary/scratch directory for this session — not the project workspace.

Include a "suggested skills" section in the document, listing skills the next agent should invoke.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed an argument, treat it as a description of what the next session will focus on and tailor the document accordingly.

## Local Override

If `.claude/skills-local/handoff/SKILL.md` exists, read it first; treat its instructions as overriding conflicting guidance above. This override file carries no frontmatter — skill discovery does not scan `.claude/skills-local/**`, so a `name:`/`description:`/`triggers:` block there would be inert and only risks a name collision if ever promoted to `.claude/skills/`. The override covers this `SKILL.md` only — bundled resources are never auto-shadowed; to replace one, place your copy under `.claude/skills-local/handoff/` and re-point to it from your local `SKILL.md`.
