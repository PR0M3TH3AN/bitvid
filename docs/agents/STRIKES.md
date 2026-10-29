# Model tier strikes

Evidence loop for per-area model tiers. A strike is one of: red landing, withdrawn
submission, reviewer rejection, peer-caught false green, owner-reported regression.

- Two strikes in a week (week = from the usage reset) -> propose moving the area UP a tier.
- Two clean weeks -> offer moving it DOWN a tier.
- Loses the thread after compaction -> raise its context.
Changes go into fleet.config.json (area `tier` / `context`) and need a fresh start of that area.

| date | area | tier | strike | evidence (SHA, check, who caught it) |
|---|---|---|---|---|
| 2026-10-20 | dispatch | strong (hub) | red landing | `47953970ec`, landq.log 13:28:15.437Z, gate exit 1; inherited NODE_TEST_CONTEXT/capture failure, not a product assertion failure. Same SHA subsequently landed `bbc1be79` after environment correction; fleet/LOG.md trial intervention. |
| 2026-10-23 | client-reliability | standard (feature) | red landing | `280f043a66`, landq.log 12:46:14.141Z, gate exit 1 after worker thermal SIGINT (398/437 files); overlapping kit validation documented in fleet/LOG.md. Later same-SHA success does not erase this event. |

2026-10-24 hourly audit: one confirmed strike per area in the current week;
no two-strike tier proposal. Historical events recovered from the append-only
landing log because a successful same-SHA retry replaces its result JSON.
`d7184f07bd` failed publication at 2026-10-23T12:39:19Z due to target-branch
divergence during the gate; fleet/LOG.md records submitting-area notification
and recovery. This infrastructure publication failure is not counted as a
second client red gate or reviewer rejection. No withdrawn submissions or
conflicts appear in the retained landing log; no additional confirmed reviewer,
peer false-green, or owner-regression event was identified in the checked
dispatch mailbox, PROGRAM, backlog and fleet log. This is not a complete audit
of every session conversation.

## 2026-10-26 additions

| date | area | tier | strike | evidence (SHA, check, who caught it) |
|---|---|---|---|---|
| 2026-10-26 | client-reliability | standard (feature) | red landing | `c20635bc8539328ca1677f3cf63cbe870adeb9c2`, landq.log 19:15:32.782Z; durable rejected/red gate exit 1 after sustained thermal stop (275/438 starts, incomplete). Area notified through MCP at19:16:19Z (`20261026T191619-dispatch-c43452.md`); candidate retained, no automatic retry. See `test_logs/TEST_LOG_2026-10-26_19-16-00_dispatch-interrupted-gate.md`. |

2026-10-26 hourly audit: client has two confirmed red landings in the last
seven days (Oct23 and Oct26), both thermal interruptions. Owner-facing proposal:
consider standard -> strong under a rolling-seven-day interpretation. The
documented strike week starts at usage reset (`usage.resetCron`: Monday03:00);
these events straddle that reset, so only one is in the current configured week.
No automatic tier/config change; stronger models do not establish thermal
clearance. Preserve the dispatch-owned resource hold and explicit fresh grant.
