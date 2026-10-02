# Live tour as a Guided Learning type

A live tour is today a Guided Learning set that happens to have an anchored step (`hasLiveTour` is inferred on save), so nobody can tell which activities are tours. This plan makes **Live tour** an explicit type, authored by admins, that never needs screenshots, and lets the Claude connector create one straight into the Help Center.

Scope was settled in a design interview with Paul on 2026-10-02. Each PR is self-contained. Symbol names are authoritative; line numbers are hints.

**Release:** everything rides the existing `gl-live-tours` flag (admin, stage `preview`). The connector tools also need `claude-connector-guided-learning` and an `/admins/{email}` doc. No changelog entry until `gl-live-tours` opens to everyone.

## Product decisions (settled — do not re-litigate)

| #   | Decision           | Answer                                                                                                                                                                                                                                                        |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Model              | A fourth `GuidedLearningMode`, `'tour'`, picked at creation beside Structured, Guided and Explore. `hasLiveTour` derives from the mode, not from whether a step happens to carry an anchor.                                                                   |
| T2  | Who authors        | Admins only. Tours live in the building library or the Help Center; teachers never see the Live tour option.                                                                                                                                                  |
| T3  | Telling them apart | A "Live tour" badge on every library and Help Center card, and a tours filter in the library and Help Center.                                                                                                                                                 |
| T4  | Anchors            | Every tour step binds an anchor (a narration step observes a board anchor). A missing anchor at runtime pauses on the "can't find this control" card and is reported. Never a text-only fallback inside a live run.                                           |
| T5  | Off-board viewing  | Only where a live run is impossible (a phone, Help Center outside a dashboard): a numbered step list with whatever step images exist.                                                                                                                         |
| T6  | Screenshots        | Optional. A draft test run captures each step's highlighted control (plus padding) with `html-to-image` and stores it as the step image, filling only steps with no image. A per-step and whole-tour Recapture refreshes them.                                |
| T7  | Studio             | Not settled. Working assumption: tour mode edits an ordered step list (anchor, action, text, Run from here) with the T6 snapshots in place of the slide canvas. Settle with Paul before PR 3.                                                                 |
| T8  | Connector          | An admin-only `create_live_tour`, listed only for admins, creates the set and, with `help_center`, a hidden `help_resources` item in an existing category (`list_help_center_categories`). `create_guided_learning` makes standard activities only.           |
| T9  | Publish state      | Claude's tours land as hidden drafts: the Help Center item has `visible: false` until an admin test-runs, publishes in the Studio and shows the item.                                                                                                         |
| T10 | Runtime misses     | A missed anchor also reaches the rebind queue, not only the run log. See open question Q1.                                                                                                                                                                    |
| T11 | Migration          | A read-only audit script (`--dry-run` default) lists every prod building set with anchors, counting steps without an anchor and without an image. Sets where every step is anchored become `mode: 'tour'`; the rest are listed for Paul to fix. Dev has none. |
| T12 | Claude guidance    | `skills/spartboard/references/live-tours.md` in `OPS-PIvers/claude-skills`; the repo's `gl-author` skill points to it for the connector path.                                                                                                                 |

## PRs

1. **Connector** (this plan's first PR): `create_live_tour`, `list_help_center_categories`, admin-only listing via `slimToolListing`'s hidden set, every live tour step bound, the claude-skills reference. Until PR 2 the connector writes `mode: 'structured'` with `hasLiveTour: true`; PR 2's migration converts them.
2. **Type**: `'tour'` in `GuidedLearningMode` (client, `glBuildingIndex.ts` `MODES`, connector), badge, filter, off-board step list, audit and migration script, connector writes `mode: 'tour'`.
3. **Studio and snapshots**: T6 and T7.

## Open questions

- **Q1 (T10):** `tour_anchor_queue` holds untagged recorder clicks and feeds the anchor-mapping routine; rules allow admin writes only. A runtime miss is usually a known anchor that didn't render, not an untagged control. Decide whether misses get their own queue status or stay in Tour Health's run-log misses (`tourRuns.ts`), which already lists them per step.
- **Q2:** `LIVE_TOURS_V3.md` D11 starts whole-tour Autopilot from `mode === 'guided'`. With `mode: 'tour'` that start state needs its own field (for example `tourSetup.autopilot`) in PR 2.
