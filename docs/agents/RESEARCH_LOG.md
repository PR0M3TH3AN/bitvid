# Prompt Library Research Log

Dated entries from web research on prompt-engineering and context-engineering
best practices. Each entry records search queries, key takeaways, sources,
and what changed in the library (or why nothing changed).

---

## 2026-02-12 — Initial Weekly Research

### Search Queries
- "Anthropic context engineering prompt engineering best practices 2025 2026 agent prompts"
- "OpenAI prompt engineering guide agent system prompts best practices 2025 2026"

### Key Sources
1. [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
2. [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
3. [OpenAI: GPT-4.1 Prompting Guide](https://cookbook.openai.com/examples/gpt4-1_prompting_guide)
4. [OpenAI: Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)

### Key Takeaways

1. **"Right altitude" of specificity** (Anthropic). Prompts should be
   specific enough to direct behavior but flexible enough for the model
   to apply heuristics. Avoid two extremes: hardcoded if-else logic
   (brittle) and vague high-level guidance (underdetermined). Our library
   is generally at the right altitude — most prompts provide specific
   commands and paths while leaving room for judgment.

2. **Structured note-taking for long-horizon agents** (Anthropic). Agents
   should maintain persistent memory files (notes, to-do lists) outside
   the context window. Our prompts already follow this pattern well —
   most require `CONTEXT.md`, `TODO.md`, `DECISIONS.md`, `TEST_LOG.md`
   as persistent state files per `AGENTS.md` Section 15.

3. **Tool descriptions should be self-contained and non-overlapping**
   (Anthropic). When agents must choose between tools/commands, the
   options should be clearly distinct. Our prompts generally do this
   well by specifying exact commands to run.

4. **Minimal high-signal context** (Anthropic). "Find the smallest
   possible set of high-signal tokens that maximize the likelihood of
   some desired outcome." Some of our prompts are verbose — this
   principle supports trimming redundant instructions. However, per our
   own hard constraints, "shorter is better — but not at the cost of
   clarity, safety, or specificity."

5. **Incremental work, clean state** (Anthropic, long-running agents).
   Agents should work on one feature at a time, commit progress with
   descriptive messages, and leave the environment in a clean state.
   Our prompts consistently enforce this with "one file per PR" and
   "one issue per PR" patterns.

6. **Build evals to measure prompt performance** (OpenAI). This is a gap
   in our library — we have no systematic way to evaluate whether a
   prompt revision improved agent behavior. Future work could establish
   simple before/after metrics for prompt changes.

7. **Pin to specific behavior expectations** (OpenAI). Production prompts
   should have predictable, testable outcomes. Our verification sections
   serve this purpose (exact commands + expected results).

8. **Examples over exhaustive rules** (Anthropic). "For an LLM, examples
   are the 'pictures' worth a thousand words." Several of our prompts
   include good examples (e.g., code patterns in innerhtml-migration,
   const-refactor). Some prompts could benefit from adding 1-2 concrete
   examples of expected behavior.

### Library Impact

**Changes made this run based on research**: None. The research validated
that our library's existing patterns (structured sections, persistent
state files, specific commands, incremental work) align well with current
best practices. No findings warranted immediate changes.

**Potential future improvements** (not applied — need evidence of benefit):
- Add concrete input/output examples to prompts that currently lack them
  (e.g., scheduler-update-agent, changelog-agent).
- Consider establishing lightweight prompt evaluation criteria (e.g.,
  "did the agent produce a correct PR on first run?") for future
  prompt revisions.
- Some prompts could be shortened by removing redundant restatements
  of constraints that are already in `AGENTS.md`. However, the
  redundancy may serve as a useful safety net for agents that don't
  always read policy docs carefully — defer this decision to a future
  run with evidence.
