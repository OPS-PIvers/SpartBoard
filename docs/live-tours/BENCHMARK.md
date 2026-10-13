# Live tour benchmark

The 12 benchmark tours from `docs/plans/LIVE_TOUR_ONE_SHOT.md` (D16, D17, "Benchmark run"), authored fresh with the Spartboard-Dev connector on 2026-10-13 and saved as building drafts on `spartboard-dev` (none added to the Help Center). Each was dry-run clean, then played on the dummy board (`vite-verify`, port 56320) with `scripts/run-live-tour.mjs`, which also uploaded its step pictures.

A tour passes only if Paul makes no edits. Find them in the Guided Learning widget > library > building sets on https://spartboard-dev.web.app.

| #   | Workflow                                       | set_id                                 | Steps | Run result                                                                       | Dry-run warnings left in                                                 | needs_anchors                 | narration_failed | Paul's edits |
| --- | ---------------------------------------------- | -------------------------------------- | ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- | ---------------- | ------------ |
| 1   | Create a quiz from scratch                     | `136d6572-f662-488d-80a7-83f66d507afb` | 11    | Green                                                                            | None                                                                     | None                          | None             |              |
| 2   | Assign a quiz to a class                       | `42835e85-88b1-48ad-8e8b-1c3ac3728251` | 8     | Green (sample content injected by hand, see B1)                                  | `assign` and `submit` persist (kept in the sandbox)                      | None                          | None             |              |
| 3   | Set up the Schedule widget                     | `ceb64021-8958-4946-9954-ff7b4f6e34cf` | 8     | Green                                                                            | None                                                                     | None                          | None             |              |
| 4   | Sync Google Calendar                           | `f8b7ac56-e761-4169-967c-191980905945` | 6     | Green                                                                            | `calendar-id` has no anchor and no value (each teacher pastes their own) | `calendar-id`                 | None             |              |
| 5   | Make random groups                             | `ff6a3e48-1034-4a37-8d7f-b733f771930d` | 7     | Green                                                                            | None                                                                     | None                          | None             |              |
| 6   | Add a class / roster                           | `7a34367e-5d5b-4d38-9349-2336d987c8a1` | 8     | Green                                                                            | `name`, `add-student`, `save` have no anchor                             | `name`, `add-student`, `save` | None             |              |
| 7   | Change a widget's style and save as my default | `e44e0c85-10ab-4775-a654-0b8bb6441d0b` | 8     | Green                                                                            | `style-defaults-save` persists (the teacher's real default, intended)    | None                          | None             |              |
| 8   | Find help in SpartBoard                        | `a77a9b0b-c2d1-4a88-b73c-78a30b697f77` | 5     | Green                                                                            | None                                                                     | None                          | None             |              |
| 9   | Create a Guided Learning set                   | `14c5998a-5d6a-49c9-932d-59f50bde86ef` | 5     | Green after cutting the post-upload steps (B9)                                   | `add-media` has no anchor                                                | `add-media`                   | None             |              |
| 10  | Share a board                                  | `2617305c-159a-4ce7-82a3-a4a586618057` | 9     | Green                                                                            | `share-link.create` persists (makes a real share link)                   | None                          | None             |              |
| 11  | Make a video activity                          | `1eb6529d-af1a-4cf2-84eb-a3c44ab40539` | 11    | Not green: steps 6-10 (timestamp, prompt, correct, wrong, save) missing, see B10 | None                                                                     | None                          | None             |              |
| 12  | Use the Timer with the schedule                | `ac3a84ed-a5b7-4a31-a65d-790dc650c2f9` | 6     | Green                                                                            | None                                                                     | None                          | None             |              |

11 of 12 ran green. No save reported `narration_failed`.

## What blocked a green run or needed a workaround

No app code was changed. None of the gaps below is a one-line anchor tag: each new anchor also needs a registry entry and a route.

### Connector and guide

- **B1. `get_live_tour` drops material sample content.** It returns `materials[]` without `sample`, and `seedTourMaterials` (`components/tours/tourMaterialSeed.ts`) seeds only when `sample` is present, so a run JSON saved straight from `get_live_tour` plays Assign a quiz against an empty library. Workaround: copied the sample quiz into the run JSON by hand. Follow-up: include `sample` in `get_live_tour`, or have the runner fetch it.
- **B2. `upload_url` is unreachable from a cloud session.** `start_live_tour_picture_upload` returns `https://spartboard-dev.web.app/mcp/tour-pictures`, which the cloud container's egress proxy refuses. Workaround: posted to `https://us-central1-spartboard-dev.cloudfunctions.net/mcpServer/tour-pictures` with `NODE_USE_ENV_PROXY=1` and `NODE_EXTRA_CA_CERTS`. Follow-up: return the functions URL, or document the override.
- **B3. A `type` step with no value is refused.** The guide calls it a warning; `create_live_tour` refuses it with "type steps take a string value". `value: ""` is accepted and gives the intended warning. Follow-up: accept a missing value, or fix the guide.
- **B4. `editor.save:quiz` passes the dry run but never renders.** The quiz editor autosaves and has no Save button. Workaround: `editor.close:quiz`. Follow-up: drop `quiz` from `editor.save`'s keys.
- **B5. The guide doesn't mention staged demo content.** A staged Schedule already holds three demo rows (`config/tourDemoContent.ts`), so a new row is `event-4`. The first run used `event-3`, typed over "Reading" and still reported found. Follow-up: list demo content in the guide, or in `list_tour_anchors` for that widget.
- **B6. A surface has only one opener.** The route map knows one `opensWith` per surface, so the dry run refuses anchors reached a second way:
  - Roster editor: tagged, but only `classes.edit-roster` opens it; **New Class** opens the same editor. Workaround: fallbacks for Class Name, Add Student and Save (tour 6).
  - Guided Learning editor: `studio.*` and `gl-editor.*` need `gl-manager.preview-open-editor`; **New Set** opens the same editor. Workaround: fallback for Add media (tour 9).
  - Follow-up: allow several openers per surface.
- **B7. Studio or classic editor depends on the admin-only `gl-studio` preview flag.** Admins get the Studio after New Set; teachers get the classic editor. Tour 9 was authored and run as an admin, so it shows the Studio. Paul should check it as a teacher before it opens.

### Runner and Autopilot

- **B8. `select` on a segmented settings field reports found without applying.** `chooseOption` (`components/tours/autopilot.ts`) looks for `[role="option"]`, which a segmented control lacks; on `settings.field:random#mode` it clicked, the drawer closed and the mode never changed. Workaround: two clicks on `random.mode` on the widget face (tour 5). Follow-up: handle radio or button groups in `chooseOption`, or have the dry run refuse `select` on them.
- **B9. The dummy board can't pick a file.** Guided Learning's **Add media** opens the file chooser, so Add step and the step text never appear. Workaround: Add media is a point-only step and the closing step describes adding steps. Follow-up: a sample image the runner can drop in, or a sample Guided Learning material.
- **B10. YouTube is blocked in the cloud container.** The video player never loads, so **Add at 0:00** stays disabled and every question step is missing. The tour is authored for a real board and should run there; it can't go green from a cloud session. Follow-up: rerun it on Paul's machine, or let the runner stub the player.
- **B11. The runner re-marks the previous step missing.** When a step's anchor is missing, the step before it also flips from found to missing in the summary, which points at the wrong step.
- **B12. Playwright expects Chromium build 1248; the container has 1194.** Workaround: symlinked the installed headless shell under a private `PLAYWRIGHT_BROWSERS_PATH`.

### App

- **B13. Calendar ID box has no anchor** (tour 4). Teachers paste their own ID, so the step points and waits.
- **B14. Help Center categories are data.** The dummy board has none, so tour 8 skips choosing a category.
- **B15. Connect Google is hidden once Google is connected.** Every teacher signs in with Google, so tour 4 starts at the Calendar settings instead.
