# App Walkthrough Capture

Use this runbook when a Guided Learning activity needs screenshots of the
SpartBoard UI. The goal is a reproducible capture of real components with
controlled data and no temporary source or dependency changes left behind.

## 1. Preflight the worktree

1. Start from the user-requested branch and run `git status --short`. Record
   existing edits and untracked files so they are not overwritten or committed.
2. Use the repository-pinned package manager. In this repository run:

   ```bash
   corepack pnpm install --frozen-lockfile
   ```

   Using another pnpm major can reject the lockfile or dependency overrides.
   If the task will end in a repository PR, also install the independently
   locked Functions dependencies before running the full validation gate:

   ```bash
   corepack pnpm -C functions install --frozen-lockfile
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

Launch Vite directly so screenshot work does not run unrelated pre-dev scripts:

```bash
VITE_AUTH_BYPASS=true corepack pnpm exec vite \
  --host 127.0.0.1 --port 56300 --strictPort
```

Wait for the server readiness message before opening the page.

## 4. Choose Playwright transport

### Playwright MCP available

Use `browser_resize`, `browser_click`, `browser_type`,
`browser_evaluate`, and `browser_take_screenshot`. Save relative paths under
`.playwright-mcp/shots/`.

### Playwright MCP unavailable

Use the repository's installed `@playwright/test` package from a local Node
script. First try its managed browser. Installing it with
`corepack pnpm exec playwright install chromium` is acceptable when
the environment permits the download.

If no managed browser is available, install a headless Chromium package in a
temporary directory so `package.json` and `pnpm-lock.yaml` stay untouched:

```bash
GL_BROWSER_TMP_DIR=$(mktemp -d)
npm install --prefix "$GL_BROWSER_TMP_DIR" --no-save @sparticuz/chromium@149.0.0
node .claude/skills/gl-author/scripts/materialize_chromium.mjs \
  "$GL_BROWSER_TMP_DIR/node_modules/@sparticuz/chromium/bin/chromium.br" \
  .playwright-mcp/chromium
```

Launch that binary with the repository's Playwright library:

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: '.playwright-mcp/chromium',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--disable-gpu',
    '--disable-webgl',
    '--disable-software-rasterizer',
    '--use-gl=disabled',
  ],
});
```

Delete the temporary package directory after capture. The materialized browser
may remain under `.playwright-mcp/`, which is ignored by git.

## 5. Capture real states

1. Set a fixed viewport, normally 1440×900, before navigation.
2. Disable transitions and animations with `page.addStyleTag` so controls do
   not move between measurement and capture.
3. Hide harness navigation and dev banners before the deliverable screenshot.
4. Open menus and dialogs through user-visible controls. Capture the states the
   guide describes, such as class selection, attendance, settings, and each
   completed widget mode.
5. Wait for semantic completion instead of sleeping. After randomization, wait
   for generated student rows, group cards, or enabled result controls, not the
   button that started the operation. Placeholder containers can appear before
   results are populated.
6. Keep timed UI visible by overriding long `window.setTimeout` delays before
   triggering it, when necessary.
7. Save numbered PNGs under `.playwright-mcp/shots/` in slide order.

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

3. For repository-level confidence, create a temporary Vitest beside
   `components/widgets/GuidedLearning/utils/glTransfer.ts` that reads the
   artifact and calls `parseGuidedLearningJson`. Expect no warnings, run that
   one test, then delete it.
4. Run `git status --short` and inspect the tracked diff. Remove temporary
   harnesses, capture scripts, browser dependencies, and package-lock changes.
   Preserve pre-existing user files and the requested `.gl.json` deliverable.
5. A large JSON preview can collapse or truncate base64 strings. Confirm the
   downloaded file by parsing it and checking the validator's decoded image
   counts and sizes.

When the task includes a repository PR, run `corepack pnpm run validate` before
pushing. On constrained executors the app-wide ESLint process can exceed Node's
default heap after type-checking. Complete that stage with:

```bash
node --max-old-space-size=4096 node_modules/eslint/bin/eslint.js . \
  --max-warnings 0
```

Then run the remaining format and test commands from `package.json`; do not
change project scripts or dependency files solely to work around executor
limits.
