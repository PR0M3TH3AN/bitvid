# Agent Prompt Style Guide

This guide defines the canonical structure, naming conventions, and quality
standards for agent prompts in `/docs/agents/prompts/`.

Authority: This guide is subordinate to `AGENTS.md` and `CLAUDE.md`. If this
guide conflicts with either, follow the higher-level document.

---

## Canonical Prompt Template

Every agent prompt should include these sections in order:

### 1. Identity & Mission
- First line: `You are: **bitvid-<agent-name>**, a <role> working inside the \`PR0M3TH3AN/bitvid\` repo.`
- One-sentence mission statement.
- The agent name in the identity line **must match** the filename (minus
  `.md` extension).

### 2. Authority Hierarchy
- Numbered list, highest authority first:
  1. `AGENTS.md`
  2. `CLAUDE.md`
  3. Domain-specific docs (varies by agent)
  4. This agent prompt (always lowest)

### 3. Scope
- **In scope**: explicit list of files, directories, and systems.
- **Out of scope**: explicit boundaries to prevent mission drift.

### 4. Goals & Success Criteria
- Numbered, measurable outcomes.
- Avoid vague criteria like "improve quality" — specify what "good" looks like.

### 5. Hard Constraints
- Non-negotiable rules in imperative voice.
- Must include: "Inspect first", "Minimal changes", "No mission drift".
- Security-sensitive guardrails per `AGENTS.md`.

### 6. Workflow
- Ordered steps with specific commands, file paths, and checks.
- Standard flow: preflight -> inspect -> plan -> implement -> verify -> document -> PR.
- Each step should name exact commands to run.

### 7. Verification
- Exact commands to run (e.g., `npm run lint`, `npm run test:unit`).
- Expected outputs or pass criteria.
- Artifacts to capture.

### 8. Failure Modes
- What to do when blocked, uncertain, or facing risky changes.
- Default: stop, log, open issue.
- Specific triggers for opening issues vs. attempting fixes.

### 9. PR & Commit Conventions
- Defer to `AGENTS.md` / `CLAUDE.md` for branch naming and conventions.
- Provide commit message examples with appropriate prefixes.
- PR body requirements (what must be included).

### 10. Outputs
- What the agent produces per run (PRs, docs, issues, reports).
- Distinguish between daily and weekly run outputs if applicable.

Specialized sections (search patterns, metrics, taxonomies, etc.) may be
added **after** section 10.

---

## Naming Conventions

### Agent Identity
- Format: `bitvid-<descriptive-name>-agent`
- The identity in the prompt **must match** the filename.
- Example: file `bitvid-style-agent.md` -> identity `bitvid-style-agent`

### Filenames
- Pattern: `bitvid-<name>-agent.md`
- Lowercase, hyphen-separated.
- No abbreviations unless well-established in the repo.

### Branch Names
- Follow `AGENTS.md` / `CLAUDE.md` conventions.
- Do not invent separate naming schemes for prompt work.

### Commit Messages
- Use conventional-commit-style prefixes:
  - `docs(agents): <description>` for prompt changes
  - `fix(ai): <description>` for agent-discovered fixes
  - `chore(ai): <description>` for mechanical changes
- Do not use emoji in commit messages.

### PR Titles
- Follow repo conventions. Do not use emoji.
- Keep under 70 characters.

---

## Voice & Tone

- **Imperative** for constraints and instructions: "Do not modify crypto logic."
- **Declarative** for descriptions: "This agent audits test coverage."
- **Concise** — cut filler words. Prefer active voice.
- **Specific** — name files, commands, and paths. Avoid "the relevant file"
  when you can say `js/constants.js`.

---

## Common Patterns to Follow

### Good: Specific Commands
```
Run: `npm run test:unit`
```

### Bad: Vague Instructions
```
Run the tests.
```

### Good: Explicit Failure Mode
```
If lint fails with non-autofixable errors, stop and open an issue
including the exact failing command and error output.
```

### Bad: Implicit Failure Mode
```
Handle errors appropriately.
```

### Good: Verified Path Reference
```
Check `js/nostrEventSchemas.js` for existing builder functions.
```

### Bad: Assumed Path Reference
```
Check the event schemas file.
```

---

## Anti-Patterns to Avoid

1. **AI generation artifacts** — Remove `:contentReference`, `oaicite`,
   or similar metadata left by AI tools.
2. **Emoji in PR titles/commit messages** — `CLAUDE.md` says to avoid emoji
   unless explicitly requested.
3. **`require()` syntax** — The project uses ES modules (`"type": "module"`).
   Always use `import`/`export` in examples.
4. **Referencing nonexistent scripts** — Verify a file exists before
   referencing it. If suggesting a script to create, say so explicitly.
5. **Identity/filename mismatch** — The agent name in the first line must
   match the filename.
6. **Truncated files** — Every prompt must have complete sections. If a
   section is missing, the prompt is incomplete.

---

## Section Heading Style

Use either Unicode box-drawing separators or markdown `---` consistently
within a single prompt. Prefer the style already established in the file
being edited.

Current conventions observed in the library:
- Daily prompts: mix of `═══` and `───`
- Weekly prompts: mostly `───`
- Schedulers: `───`

Standardization of heading style is P3 priority — functional correctness
and policy alignment take precedence.
