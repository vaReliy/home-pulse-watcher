---
name: grill-me
description: >-
  Interview the user relentlessly, one question at a time, about a plan or design already on the table until every branch of the decision tree is resolved and both sides share the same understanding. Use when the user wants to stress-test a plan, get grilled on their design, or says "grill me". NOT for generating ideas before a design exists (use `brainstorming`) or for turning an agreed design into actionable tasks (see `rules/cts/task-authoring.md`).
  
  Українською: стрес-тестування плану, допитай мене, запитання щодо дизайну, перевір рішення по пунктах.
---

# Grill Me

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a _fact_ can be found by exploring the codebase, look it up rather than asking. The _decisions_, though, are the user's — put each one to them and wait for their answer.

Do not enact the plan until the user confirms a shared understanding has been reached.

## Local Override

If `.claude/skills-local/grill-me/SKILL.md` exists, read it first; treat its instructions as overriding conflicting guidance above. This override file carries no frontmatter — skill discovery does not scan `.claude/skills-local/**`, so a `name:`/`description:`/`triggers:` block there would be inert and only risks a name collision if ever promoted to `.claude/skills/`. The override covers this `SKILL.md` only — bundled resources are never auto-shadowed; to replace one, place your copy under `.claude/skills-local/grill-me/` and re-point to it from your local `SKILL.md`.
