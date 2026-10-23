# Web tours: record fast, Claude finishes

Goal: an admin clicks through a website at full speed with the extension recording, and Claude writes every step's title and tip. Each tour is checked by playing it before it publishes, and keeps finding its buttons as sites change. No narration and no AI other than Claude.

Settled in a design interview with Paul on 2026-10-22, after research into Scribe, Tango, Supademo, Arcade, Guidde, WalkMe, Whatfix, Pendo, Userlane, the Chrome DevTools Recorder and the Similo papers. It builds on [CHROME_EXTENSION.md](../CHROME_EXTENSION.md) and [WEB_TOURS_UX.md](WEB_TOURS_UX.md). D3 still holds: the extension never reads or writes Firestore.

**Code references** were taken at `dev-paul` `8035727f9`. Symbol names are authoritative; line numbers are hints.

## Starting facts

- **Playback tries one clue after another.** `locate()` (`extension/src/playback/locate.ts:197`) tries role and name, then text, then the CSS path. The recorded box only breaks a tie within one clue. It already walks open shadow roots (`rootsOf`) and frame chains (`controller.ts:109`).
- **Web tour health exists.** Runs (`TourRun` in `components/tours/tourRuns.ts`) record `misses` and `weak` (`stepId:text|css`). `webFieldStatsOf` (`components/tours/web/webTourHealth.ts`) and `WebTourHealthSection.tsx` show them per published version.
- **Pictures** are taken by `chrome.tabs.captureVisibleTab` in `extension/src/recorder/worker.ts:250`, then cropped in the side panel. Blur today is by hand: `BlurBoxes` in the side panel and the editor.
- **Student data.** `findStudentData` and `scrubCapturedText` (`components/tours/web/studentData.ts`) scan text. `publishBlockers` (`webStepReview.ts:193`) blocks on text hard hits, and `picturesNeedConfirm` asks for one picture confirm. Roster matching runs only in SpartBoard, from the admin's Drive rosters.
- **Connector.** #4574 added `list_web_tours`, `get_web_tour`, `get_web_tour_step_picture` and `update_web_tour_text` (`functions/src/mcp/webTourTools.ts`). They are admin-only and behind `web-tours`, edit only titles and tips, never publish, and keep revisions.
- **AI.** Every model call goes through `generateAi` with an integration registered in `functions/src/aiIntegrations.ts` and `config/aiIntegrations.ts`. Admins pick the model per integration.

## Decisions

### Matching

- **C1. Score every candidate on all clues.** Collect candidates from role+name, text and CSS, then score each on name, text, role, tag, stable attributes, nearest heading or label, and distance from the recorded box. Each clue is weighted, Similo-style. Take the best only when it clears a floor and beats the runner-up by a margin. This replaces the fallback chain for every web tour, old ones included.
- **C2. Weak means narrow.** A match that clears the floor but not the margin plays, and is reported in `weak` as a new `score` kind. Existing `text`/`css` entries still parse.
- **C3. Record more per click.** Add the nearest heading or label text, `document.title`, and stable attributes (`data-testid`, `aria-label`, `name`, `href` path with ids replaced by `*`) to `WebTourLocator`. All captured text goes through `scrubCapturedText`. No page HTML is stored.

### Blur before capture

- **C4. The extension blurs the page, then takes the picture.** Before `captureVisibleTab`, a content script finds matches in visible text nodes and form values, blurs them with an injected style, captures, then removes the style. Only the blurred picture exists.
- **C5. Patterns only.** Emails, ID and phone numbers, "Last, First" and typed form values are on by default. Table rows and images are off, since they often hold what the tour teaches. The side panel shows these as toggles and lets the admin click an element to blur it. No roster or student names list ever reaches the extension.
- **C6. Hand blur and the picture check stay.** The editor's Blur button covers leftovers. The Publish picture confirm stays because roster names aren't covered.

### Intent without narration

- **C7. Optional goal.** Send shows an optional "What does your tour explain?" box under the title, saved on the draft and editable in the editor. It never blocks.
- **C8. Private note per step.** A "Note for Claude" field in the side panel and the editor. It is stored on `step.web`, never shown during playback, and never published.

### Claude writes

- **C9. Two ways in.** In the editor, **Write with Claude** calls a new integration, `web-tour-writing`, set to Claude by default. It sends the goal, the steps in order with their clues and notes, and the pictures. The connector tools from #4574 do the same in a chat; `get_web_tour` adds the goal and notes.
- **C10. Fill blanks.** It writes starter titles (from `draftLabel`) and empty tips, and keeps anything the admin typed. **Rewrite all** is a separate choice. Each run can be undone.
- **C11. Questions on the step.** When Claude can't tell why a step happens, it returns a short question that shows under that step's tip. The admin types a few words in the step's note and runs it again for just those steps. Through the connector, Claude asks in chat.

### Check before publish

- **C12. Check mode.** **Check tour** plays the tour with scoring shown per step: found, weak, ambiguous or not found. A person plays it, or Claude in Chrome does. A step passes once its target is found clearly, and **Next** advances without a real click, so nothing is submitted for real. Clicking still works when a later page needs it. Nothing clicks on its own.
- **C13. Publish needs a clean check.** `publishBlockers` adds a blocker until this draft has a check run with every step passing. Changing a target (Fix on site, an accepted repair, adding, removing or reordering steps) expires it. Edits to text, notes or blur don't. The check result is stored with a signature of the targets, the same way `checked` works.

### Repairs

- **C14. Suggest, don't apply.** When a step misses or plays weak, the extension saves its best candidate's clues as a suggestion on that step. The editor shows **Suggested fix** with before and after, and the admin accepts it or uses Fix on site. Claude can read suggestions through the connector and recommend one, but can't accept it. Nothing changes a published tour without a republish.
- **C15. Teachers send clues only.** A teacher's run reports the miss and the candidate's clues, never a picture. A fresh picture is saved only from an admin's own run or a check run. Suggestions from teacher runs reach the draft through the same run reporting health uses, not through the extension.
- **C16. No noisy alerts.** Health flags a step when it misses or plays weak in more than one run of the current version, not on a single miss.

## New wording for Paul's OK

- Send form: "What does your tour explain?" (optional box)
- Step field: "Note for Claude"
- Editor buttons: "Write with Claude", "Rewrite all", "Check tour"
- Check results: "Found", "Weak match", "Matches more than one", "Not found"
- Publish blocker: "Check the tour before publishing."
- Repair: "Suggested fix", "Use this fix"
- Blur toggles: "Emails", "ID and phone numbers", "Names written Last, First", "Typed in fields", "Table rows", "Images", and "Click to blur"

## PRs

All behind the existing `web-tours` flag (admin, preview). Extension version goes up in each PR that changes it. Each PR gets Paul's screenshot OK before merge.

1. **Scored matching and extra clues (C1-C3).** `locate.ts` scoring with tests on recorded fixtures, new locator fields in the recorder, protocol and `types.ts`, and the `score` weak kind in health.
2. **Blur before capture (C4-C6).** Content-script blur, side panel toggles and click to blur, and tests for the matchers.
3. **Goal, notes and Write with Claude (C7-C11).** Send box, note fields, the `web-tour-writing` integration, the editor button, questions on steps, and connector fields.
4. **Check mode and the Publish gate (C12-C13).** Check playback in the extension, results in the editor, and the blocker with a target signature.
5. **Suggested repairs (C14-C16).** Suggestions from runs, the editor's before and after, the connector read, and the health threshold.

## Risks

- **Scoring changes which element old tours pick.** Run the new matcher against recorded fixtures from real tours (Schoology, Google Docs, claude.ai) and compare with today's picks before merging PR 1.
- **Blur timing.** Restyling the page right before capture can flash or shift layout. Blur with `filter` only, no layout changes, and capture on the next frame.
- **Pictures go to Claude before the roster check.** Pattern blur runs first, but roster names can still appear. This was accepted for better text (C9). Publish still checks.
- **Check mode on steps behind a submit.** A later page that only opens after a real submit can't be reached with Next alone. There the checker has to click for real, so the check needs a test account or test data on that site.
