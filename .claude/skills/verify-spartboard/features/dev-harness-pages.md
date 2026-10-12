# Dev harness pages

Fixture pages that render real SpartBoard screens with canned data, for surfaces the Isolated board cannot reach (student quiz and video views, library managers, Guided Learning, notebooks, live-tour views, the assign stepper, gradebook, teams). They exist only in the dev server.

## Sub-features

- `harness-library` shows the library managers for quiz, video activity, guided learning, mini app, flashcards, activity wall and review (`/library-managers-dev`).
- `harness-session-views` shows student-side quiz and video activity views (`/session-views-dev`).
- `harness-student-landing` shows the student landing page (`/student-landing-dev`).
- `harness-other` covers `/gl-views-dev`, `/notebook-views-dev`, `/live-tour-views-dev`, `/assign-stepper-dev`, `/gradebook-dev`, `/library-dev`, `/media-review-dev`, `/notebook-editor-dev`, `/teams-*-dev`, `/widget-grader-dev`, `/sparty-dev`.

## How to get to it (user POV)

- Not a teacher path: these are developer fixtures. Use one only when the real board cannot show the change (student views, Firestore-backed lists) and say in the report that the proof came from a harness page.

## Driving it with the browser pane

Preconditions:

- Baseline from `README.md`. Harness routes need `import.meta.env.DEV`, which `vite-verify` has.

- **Open.** `navigate` to `http://localhost:56320/library-managers-dev`. Within 10 s the page text lists the tabs `quiz`, `video-activity`, `guided-learning`, `mini-app`, `flashcards`, `activity-wall`, `review` and a `Library` with seeded items (e.g. `Unit 1 checkpoint`, `10 QS`).
- **Switch fixture.** `find "video-activity"`, click. The library re-renders with video activity items.
- **Narrow width.** `resize_window { width: 420, height: 800 }`. The library collapses to its narrow layout. Screenshot, then resize back to 1280x800.
- **Proof.** `evidence.mjs new dev-harness-pages library-managers-dev`; screenshot each state and `note` the route and fixture shown.

## Gotchas

- A harness page proves rendering, not wiring. A change to how the real board reaches that screen still needs the board journey.
- `get_page_text` right after `navigate` can return an empty body while chunks load; wait until `document.body.innerText.trim().length > 20`.
- If a harness route renders a blank page in a production build, it was built without `NODE_ENV=development`; use the dev server.
- Not yet proven end to end; `/library-managers-dev` rendering was confirmed live on 2026-10-12.
