# Implementation specs — Cluster-3 backlog (design-first handoffs)

These are **design-first implementation specs**, not built features. Each was produced by a read-only architecture pass that verified the backlog claim against the **current code on `dev-paul`** (the plan docs in this repo routinely lag the code), then laid out a recommendation-led build plan with the genuine open decisions flagged for Paul.

They come from the backlog burndown that is now the root [`TODO.md`](../../TODO.md) — the Cluster-3 (large/needs-design) items, which were intentionally specced rather than built in the async run.

| Spec                                                               | Backlog item | Status                                                                     | What it covers                                                                                          |
| ------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [M12](../plans/shipped/specs/M12-written-response-rubrics-spec.md) | M12          | Shipped                                                                    | Written-response Phase 3: rubric-based grading (types, builder UI, `/rubrics`, CSV, PLC sharing)        |
| [M13](../plans/shipped/specs/M13-student-landing-overhaul-spec.md) | M13          | Superseded by [Student landing v2](../plans/shipped/STUDENT_LANDING_V2.md) | Student-landing overhaul                                                                                |
| [M17](../plans/shipped/specs/M17-individual-assignments-spec.md)   | M17          | Shipped                                                                    | Individual assignments                                                                                  |
| [M16](M16-plc-phases-7-8-spec.md)                                  | M16          | Open                                                                       | PLC roadmap Phases 7-8: Mini-Apps + Guided Learning sharing (mirrors existing PLC quiz/VA architecture) |
| [LO12](LO12-nexus-widget-connections-spec.md)                      | LO12         | Open                                                                       | Widget-connection (Nexus) architecture + evaluation of the 9 candidates, with a tracer recommendation   |

## How to use these

1. Read the **"Open Decisions (Need Paul)"** section in each spec first — that's where the genuine forks live.
2. Resolve those decisions, then a build run can execute the spec.
3. Each spec is self-contained: current-state audit, recommended design, exact files to create/modify, data model, phased build sequence, testing, and risks.
