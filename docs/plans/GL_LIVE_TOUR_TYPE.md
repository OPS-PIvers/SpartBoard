# Live tour as a Guided Learning type

A live tour is today a Guided Learning set that happens to have an anchored step (`hasLiveTour` is inferred on save), so nobody can tell which activities are tours. This plan makes **Live tour** an explicit type, authored by admins, that never needs screenshots, and lets the Claude connector create one straight into the Help Center.

Scope was settled in a design interview with Paul on 2026-10-02. Each PR is self-contained. Symbol names are authoritative; line numbers are hints.

**Release:** everything rides the existing `gl-live-tours` flag (admin, stage `preview`). The connector tools also need `claude-connector-guided-learning` and an `/admins/{email}` doc. No changelog entry until `gl-live-tours` opens to everyone.

## Product decisions (settled — do not re-litigate)

| #   | Decision           | Answer                                                                                                                                                                                                                                                                                |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Model              | A fourth `GuidedLearningMode`, `'tour'`, picked at creation beside Structured, Guided and Explore. `hasLiveTour` derives from the mode, not from whether a step happens to carry an anchor.                                                                                           |
| T2  | Who authors        | Admins only. Tours live in the building library or the Help Center; teachers never see the Live tour option.                                                                                                                                                                          |
| T3  | Telling them apart | A "Live tour" badge on every library and Help Center card, and a tours filter in the library and Help Center.                                                                                                                                                                         |
| T4  | Anchors            | Every tour step binds an anchor (a narration step observes the control it describes; intro and outro steps get a whole-board anchor in PR 2). A missing anchor at runtime pauses on the "can't find this control" card and is reported. Never a text-only fallback inside a live run. |
| T5  | Off-board viewing  | Only where a live run is impossible (a phone, Help Center outside a dashboard): a numbered step list with whatever step images exist.                                                                                                                                                 |
| T6  | Screenshots        | Optional. A draft test run captures each step's highlighted control (plus padding) with `html-to-image` and stores it as the step image, filling only steps with no image. A per-step and whole-tour Recapture refreshes them.                                                        |
| T7  | Studio             | Settled by Paul 2026-10-03: tours keep the slide canvas. Each step's T6 snapshot becomes its slide; there is no separate step-list editor.                                                                                                                                            |
| T8  | Connector          | An admin-only `create_live_tour`, listed only for admins, creates the set and, with `help_center`, a hidden `help_resources` item in an existing category (`list_help_center_categories`). `create_guided_learning` makes standard activities only.                                   |
| T9  | Publish state      | Claude's tours land as hidden drafts: the Help Center item has `visible: false` until an admin test-runs, publishes in the Studio and shows the item.                                                                                                                                 |
| T10 | Runtime misses     | A missed anchor also reaches the rebind queue, not only the run log. See open question Q1.                                                                                                                                                                                            |
| T11 | Migration          | A read-only audit script (`--dry-run` default) lists every prod building set with anchors, counting steps without an anchor and without an image. Sets where every step is anchored become `mode: 'tour'`; the rest are listed for Paul to fix. Dev has none.                         |
| T12 | Claude guidance    | `skills/spartboard/references/live-tours.md` in `OPS-PIvers/claude-skills`; the repo's `gl-author` skill points to it for the connector path.                                                                                                                                         |

## PRs

1. **Connector** (merged as #3794): `create_live_tour`, `list_help_center_categories`, admin-only listing via `slimToolListing`'s hidden set, every live tour step bound, the claude-skills reference.
2. **Type**, split into three parallel PRs:
   - **2a, mode:** `'tour'` in `GuidedLearningMode` (client, both index builders, the import adapter), `hasLiveTour` stamped from the mode (`isLiveTourSet`; the anchored-step fallback stays until the T11 migration has run on prod), the Studio's Live tour play mode for building sets, recorded tours saved as `'tour'`, and the connector writing `'tour'` and refusing a mode change on a tour. The whole-board anchor is `board.whole` on `#dashboard-root`: the runner plays it as a centred card on the dimmed board, exactly like a plain step (`liveTourStepsOf`), and the recorder never resolves a click to it. Q2 is `tourSetup.autopilot`.
   - **2b, badge, filter and off-board list (T3, T5):** keyed off `hasLiveTour`, so it does not wait on 2a.
   - **2c, audit and migration script (T11):** sets that were `mode: 'guided'` also get `tourSetup.autopilot: true`, so they keep starting with Autopilot on.
3. **Studio and snapshots**: T6 and T7.

## Open questions

- **Q1 (T10), decided in 2a:** misses stay in Tour Health's run log; no new queue status. Was: `tour_anchor_queue` holds untagged recorder clicks and feeds the anchor-mapping routine; rules allow admin writes only. A runtime miss is usually a known anchor that didn't render, not an untagged control. Decide whether misses get their own queue status or stay in Tour Health's run-log misses (`tourRuns.ts`), which already lists them per step.
- **Q2, decided in 2a:** `tourSetup.autopilot`. Was: `LIVE_TOURS_V3.md` D11 starts whole-tour Autopilot from `mode === 'guided'`. With `mode: 'tour'` that start state needs its own field (for example `tourSetup.autopilot`) in PR 2.
