# Implementation specs — Cluster-3 backlog (design-first handoffs)

These are **design-first implementation specs**, not built features. Each was produced by a read-only architecture pass that verified the backlog claim against the **current code on `dev-paul`** (the plan docs in this repo routinely lag the code), then laid out a recommendation-led build plan with the genuine open decisions flagged for Paul.

They come from the backlog burndown of `docs/remaining-todos-audit.md` (since consolidated into the root [`TODO.md`](../../TODO.md)) — the Cluster-3 (large/needs-design) items, which were intentionally specced rather than built in the async run.

| Spec                                          | Backlog item | What it covers                                                                                                                                 |
| --------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [H1](H1-monitor-results-redesign-spec.md)     | H1           | Real Monitor & Results redesign for Quiz + Video Activity (spatial-zone IA, projector-glanceable; builds on `components/common/sessionViews/`) |
| [H2](H2-rostered-join-links-spec.md)          | H2           | Rostered sign-in join links across the 4 student activity widgets (alongside anonymous PIN-join)                                               |
| [M12](M12-written-response-rubrics-spec.md)   | M12          | Written-response Phase 3 — rubric-based grading (types, builder UI, `/rubrics`, CSV, PLC sharing)                                              |
| [M13](M13-student-landing-overhaul-spec.md)   | M13          | Student-landing overhaul (teacherDirectory CF, `StudentPageConfig.sectionOrder`, section components, ResultsModal)                             |
| [M16](M16-plc-phases-7-8-spec.md)             | M16          | PLC roadmap Phases 7–8 — Mini-Apps + Guided Learning sharing (mirrors existing PLC quiz/VA architecture)                                       |
| [LO12](LO12-nexus-widget-connections-spec.md) | LO12         | Widget-connection (Nexus) architecture + evaluation of the 9 candidates, with a tracer recommendation                                          |

## How to use these

1. Read the **"Open Decisions (Need Paul)"** section in each spec first — that's where the genuine forks live.
2. Resolve those decisions, then a build run can execute the spec.
3. Each spec is self-contained: current-state audit, recommended design, exact files to create/modify, data model, phased build sequence, testing, and risks.
