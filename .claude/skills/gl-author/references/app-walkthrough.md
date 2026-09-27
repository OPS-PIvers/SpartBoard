# App Walkthrough Capture

Use this runbook when a Guided Learning activity needs screenshots of the
SpartBoard UI. The goal is a reproducible capture of real components with
controlled data and no temporary source or dependency changes left behind.

## 1. Preflight the worktree

1. Start from the user-requested branch and run `git status --short`. Record
   existing edits and untracked files so they are not overwritten or committed.
2. Install dependencies only if `node_modules` is missing, with the
   repository's own command (root and `functions/`):

   ```bash
   pnpm run install:all
   ```

3. Inspect the widget, settings panel, contexts, and existing dev harnesses
   before adding mock code. Use rendered labels or source-backed accessible
   selectors rather than guessing selectors.

## 2. Choose a deterministic app surface

Try `vite-dev-bypass` or an existing `*-dev` harness first. If authentication,
Firebase, Drive, emulators, or unavailable account data prevents the requested
state, add a temporary dev-only harness instead of patching production stores.

A capture harness should:

- mount the real widget and settings components;
- supply the smallest real providers they need;
- mock only context actions and external data;
- keep all fixture data inside the harness or a neighboring mock module;
- expose important states through query parameters or visible controls; and
- be lazy-loaded behind `import.meta.env.DEV` on a `*-dev` route.

Do not seed `useFirestore`, `useRosters`, or another production data path for a
screenshot. Remove a temporary route, harness, and mock module after the
screenshots unless the user explicitly asks to keep them.

For roster-based widget guides, useful fixtures usually include two named
classes, 12–16 students per class, and two absent students. Add special cases
only when the widget visibly supports them, such as a pair of students who
cannot share a group. Use fictional names and no personal data.

## 3. Start Vite without incidental tracked edits

Launch Vite directly so screenshot work does not run unrelated pre-dev scripts
(this is the `vite-dev-bypass` launch config):

```bash
VITE_AUTH_BYPASS=true pnpm exec vite \
  --host 127.0.0.1 --port 56300 --strictPort
```

Wait for the server readiness message before opening the page. Without a
`.env.local` the app renders a blank page; for capture, export placeholder
`VITE_FIREBASE_*` values in that shell (project id `demo-spartboard`) rather
than writing a file, so nothing talks to prod or dev. The bypass
user is a mock admin, so admin-only previews such as live tours and the
calmer player are on. It does not bypass Firestore rules: anything that
must be saved server-side needs a harness.

## 4. Choose Playwright transport

### Playwright MCP available

Use `browser_resize`, `browser_click`, `browser_type`,
`browser_evaluate`, and `browser_take_screenshot`. Save relative paths under
`.playwright-mcp/shots/`.

### Playwright MCP unavailable

Use the repository's installed `@playwright/test` package from a local Node
script (an `.mjs` file under `.playwright-mcp/`, which git ignores). Cloud
sessions ship Chromium at `/opt/pw-browsers`, but its build number rarely
matches the one the installed Playwright looks for, so launch it
explicitly and never run `playwright install` there:

```js
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
});
```

Only when no browser exists at all, install a headless Chromium package in
a temporary directory so `package.json` and `pnpm-lock.yaml` stay untouched:

```bash
GL_BROWSER_TMP_DIR=$(mktemp -d)
npm install --prefix "$GL_BROWSER_TMP_DIR" --no-save @sparticuz/chromium@149.0.0
node .claude/skills/gl-author/scripts/materialize_chromium.mjs \
  "$GL_BROWSER_TMP_DIR/node_modules/@sparticuz/chromium/bin/chromium.br" \
  .playwright-mcp/chromium
```

and launch it with `executablePath: '.playwright-mcp/chromium'` and
`args: ['--no-sandbox', '--disable-dev-shm-usage', '--single-process',
'--disable-gpu', '--use-gl=disabled']`. Delete the temporary package
directory after capture.

## 5. Capture real states

1. Set a fixed viewport, normally 1440×900, before navigation.
2. Disable transitions and animations with `page.addStyleTag` so controls do
   not move between measurement and capture.
3. Hide harness navigation and dev banners before the deliverable screenshot.
4. Open menus and dialogs through user-visible controls. Capture the states the
   guide describes, such as class selection, attendance, settings, and each
   completed widget mode.
5. Close first-run toasts ("Welcome! Board created") before a screenshot;
   they can sit over the settings panel. Freeze time-based widgets with
   `page.clock.setFixedTime(...)` so every slide shows the same time.
   Dock items are drag handles that report `aria-disabled` outside edit
   mode, so click them with `{ force: true }`.
6. Wait for semantic completion instead of sleeping. After randomization, wait
   for generated student rows, group cards, or enabled result controls, not the
   button that started the operation. Placeholder containers can appear before
   results are populated.
7. Keep timed UI visible by overriding long `window.setTimeout` delays before
   triggering it, when necessary.
8. Save numbered PNGs under `.playwright-mcp/shots/` in slide order.

## 6. Measure and verify hotspots

Use `locator.boundingBox()` immediately before capture when a DOM target is
available, and write the whole box as the step's `region` (exact bounds, not
an estimated centre point):

```js
const box = await locator.boundingBox();
const xPct = (100 * (box.x + box.width / 2)) / viewportWidth;
const yPct = (100 * (box.y + box.height / 2)) / viewportHeight;
const region = {
  shape: 'rect',
  wPct: (100 * box.width) / viewportWidth,
  hPct: (100 * box.height) / viewportHeight,
  cornerPct: 20, // round buttons: use shape 'ellipse' instead
};
```

For canvas content or a target without stable DOM bounds, inspect the saved PNG
at full resolution and measure there. Record `imageIndex` with every point.

For a live tour, the same locator gives the step's anchor. Import the helpers
from `.claude/skills/gl-author/scripts/tour_anchor.mjs` and, before each
step's screenshot:

```js
import {
  checkAnchor,
  fallbackFor,
  measureWidgetLayout,
  refFor,
} from '../.claude/skills/gl-author/scripts/tour_anchor.mjs';

const ref = await refFor(locator); // e.g. settings.field:clock#format24
const { box } = await checkAnchor(page, ref); // fails if the runner could not use it
const fallback = await fallbackFor(locator); // { role, name } or null
```

Leave `fallback` out when it returns null. Measure each tour
widget with `measureWidgetLayout(page, 'clock', 0)` once it sits where the
screenshots show it. See [live-tour.md](live-tour.md) for what to do with
them.

Render a verification copy of every slide with numbered pins, then inspect a
contact sheet. A pin or region must land on the intended control or content,
no callout may cover its target, and the
underlying screenshot must show a populated, readable state. Verification
overlays are QA artifacts only; embed the unmarked screenshots in the guide.

## 7. Package, test, and clean up

1. Embed the original PNG bytes as `data:image/png;base64,...` entries.
2. Run:

   ```bash
   node .claude/skills/gl-author/scripts/validate_gl_json.mjs path/to/file.gl.json
   ```

3. For repository-level confidence, copy the file next to
   `.claude/skills/gl-author/examples/` temporarily and run
   `pnpm exec vitest run tests/glAuthorExamples.test.ts`: it runs every
   example through the validator, the app's `parseGuidedLearningJson` and
   import validation, and the app's own anchor check. Remove the copy
   afterwards unless the user wants it kept as an example.
4. Run `git status --short` and inspect the tracked diff. Remove temporary
   harnesses, capture scripts, browser dependencies, and package-lock changes.
   Preserve pre-existing user files and the requested `.gl.json` deliverable.
5. A large JSON preview can collapse or truncate base64 strings. Confirm the
   downloaded file by parsing it and checking the validator's decoded image
   counts and sizes.

When the task includes a repository PR, follow the repository's CLAUDE.md:
the pre-commit hook lints and formats staged files, `pnpm exec vitest related
--run <files>` covers tests, and CI runs the full gates. Never run the full
`validate`, `lint` or `test` scripts locally.
