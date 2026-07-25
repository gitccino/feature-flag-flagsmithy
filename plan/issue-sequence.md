# Execution sequence — issues #9–#20

Working order for a single developer. Live source of truth for *what to build next*;
`#9-production-launch.md` remains the decision record for *why*.

Note: that plan's Phase 6 is superseded. It described segments as three
layer-split slices; #16 / #18 / #19 replace it with a tracer plus two widenings.

---

## Dependency graph

```
#9  duplicate components ──┬──▶ #12 API keys ──┬──▶ #16 tracer ──▶ #18 widen conditions ──▶ #19 widen rules
                           │                   │
                           └──▶ #13 audit UI ──┴──▶ #15 README ──┐
                                                                 │
#10 migrations ──────────────────────────────────────────────────┼──▶ #17 DEPLOY
#14 signup limit ────────────────────────────────────────────────┘
#11 test gaps      (independent)
#20 Dockerfile     (independent)
```

Critical path to deploy: **#9 → #12 → #16 → #17**, four deep. #16 is the largest
ticket and dominates wall-clock.

---

## Order

| # | Issue | Why here |
|---|-------|----------|
| 1 | **#9** duplicate components | Prefactor. Unblocks #12 and #13. Smallest ticket, and every later one touches this area. |
| 2 | **#10** migrations | Before any schema edit. #16 may want an index, and `db:push` must not be the tool that applies it. |
| 3 | **#12** API keys | Unblocks #16 and #15. Also the ticket that makes the existing evaluation API reachable — first real product unlock. |
| 4 | **#13** audit UI | Adjacent route, same shell, same query patterns as #12. Context is already warm — cheapest moment to do it. |
| 5 | **#16** segment tracer | The big one. Fresh context window, nothing else competing. Needs a key from #12 to verify by curl. |
| 6 | **#11** eval test gaps | #16 just spent a full session in the evaluation tests. Extend them while that's still loaded. |
| 7 | **#14** signup limit | Small, isolated, no dependency on anything above. Deliberate low-cognitive ticket after two heavy ones. |
| 8 | **#15** README | Last, so every claim it makes is already true — keys, audit, segments all exist by now. |
| 9 | **#17** DEPLOY | Live URL. Segments ship at launch, working. |
| 10 | **#18** widen conditions | Post-launch. Exercises the bumped cache key against real in-flight entries. |
| 11 | **#19** widen rules | Needs the full condition vocabulary from #18 to be worth authoring against. |
| 12 | **#20** Dockerfile | Touches no app code, blocks nothing. Makes the self-hostable claim true. |

---

## Why not just follow the graph topologically

The graph allows several valid orders; three things break the tie.

**Context locality.** #12 and #13 both live on the project settings/audit routes and
share query and shell patterns. Doing them back-to-back means one exploration pass,
not two. Same reason #11 sits directly after #16.

**Risk front-loading.** #16 is the only ticket with real unknowns left (cache shape
change, new evaluator path). It gets a clean context window and lands before deploy,
not after.

**Deliberate pacing.** #14 is a small isolated ticket placed immediately after the two
heaviest. Not filler — a checkpoint where the tree is green and nothing is half-built.

Order does not change total effort for one developer working sequentially. It changes
how much re-reading you do, and how early you find out something was wrong.

---

## Per-ticket working rules

- One branch per issue, one PR, `Closes #N` in the description.
- Ticket is done when its acceptance boxes are all checked, `tsc` and `lint` are clean,
  and its own verification step passes — not when the code compiles.
- Every ticket that mutates flags, segments, rules, keys or projects writes an audit
  row and invalidates the right cache tag. That is CLAUDE.md principle 7, not
  per-ticket scope.
- After #17, `main` is deployed. #18 and #19 land against a live system — verify
  invalidation in production, not only locally.

## If parallelising

Two agents, no file contention:

- Track A: #9 → #12 → #13 → #16
- Track B: #10 → #14 → #11 → #20

Both converge on #15 then #17. Track A is the critical path; Track B is slack.
