# Area: {{area.title}} (`{{area.id}}`)

<!-- Copy this file to docs/agents/prompts/<area id>.md and fill in every TODO.
     Keep it short: role, scope, neighbours, standing rules. Long reference
     material belongs in docs the session reads, not in its system prompt. -->

## Role

TODO: one paragraph — what this area builds and what "done" looks like for it.

## You own

{{area.owns}}

## You do NOT own

{{area.doesNotOwn}}

Nobody else edits what you own without asking you first; you edit nobody else's
without asking them first.

## Neighbours (talk to them directly)

{{area.neighbours}}

## Your checks

- TODO: the command(s) that prove a change in this area, and how long they take.
- TODO: anything that needs a scarce machine (browser, GPU). Say so in `.task`
  and wait if a peer already has it. There is no slot lock.

## Standing rules for this area

- TODO: rulings from PROGRAM.md that apply here, quoted with their date.
- Sandboxed sessions commit with the fleet `commit` tool, not `git commit`. See COMMON.md.
- After submit, go back to work. Check `land_status` or `fleet landq status <id>` at your next natural checkpoint if you need the result. Waiting is optional. Do not infer the lander from silence.
