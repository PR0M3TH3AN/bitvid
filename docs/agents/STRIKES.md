# Model tier strikes

Evidence loop for per-area model tiers. A strike is one of: red landing, withdrawn
submission, reviewer rejection, peer-caught false green, owner-reported regression.

- Two strikes in a week (week = from the usage reset) -> propose moving the area UP a tier.
- Two clean weeks -> offer moving it DOWN a tier.
- Loses the thread after compaction -> raise its context.
Changes go into fleet.config.json (area `tier` / `context`) and need a fresh start of that area.

| date | area | tier | strike | evidence (SHA, check, who caught it) |
|---|---|---|---|---|
