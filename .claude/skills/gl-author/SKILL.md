---
name: gl-author
description: Author or fill in importable SpartBoard Guided Learning activities (.gl.json) from images plus a learning-goal description. Use when asked to create, generate, or convert a guided learning activity, hotspot lesson, labeled-diagram walkthrough, app-screenshot walkthrough, or .gl.json file, or to configure the empty hotspots in an exported one. Covers the exact schema, hotspot coordinate rules, interaction choice, and validation requirements so the output imports cleanly via the Guided Learning widget's Import wizard.
---

# GL Author

Produce a single self-contained `.gl.json` file that the SpartBoard Guided
Learning widget can import (Library tab → Import → upload file or paste JSON).
The format is exactly one `GuidedLearningSet` object — the same envelope the
app's own Export action writes — with all slide images embedded as base64
data URIs.

## Workflow

1. **Get the images.** For app walkthroughs, capture screenshots with
   Playwright (see Screenshots below). For diagrams, read the supplied
   image at full resolution. When starting from an exported file, decode
   each `imageUrls` entry and overlay its existing pins so you can see what
   the author meant.
2. **Plan steps.** One hotspot per thing the audience must notice. 4–10
   steps for a diagram; up to ~16 for an app walkthrough. Add pins for
   controls the story needs (a Save button, a toggle) even if the author
   skipped them.
3. **Place coordinates.** `xPct`/`yPct` are percentages (0–100) **of the
   image itself**: `xPct = 100 * x_pixels / image_width`. Measure on the
   full-resolution image, never a thumbnail; aim at the center of the
   feature.
4. **Verify placement.** Render each slide with the pins overlaid and look
   at it. Every pin sits on its target before you move on; estimated pins
   miss small icons about half the time.
5. **Choose the interaction per step** (see Interaction choice) and write
   the text (see Writing rules). Every step gets a `label`.
6. **Embed images.** Convert each image to a base64 data URI
   (`data:image/png;base64,…` or `image/jpeg`), in `imageUrls` in slide
   order. The importer re-hosts data URIs to Storage.
7. **Validate** against the rules below, then save as
   `<Title>.<first-8-of-id>.gl.json`.

## Screenshots (app walkthroughs)

Use the Playwright MCP (`mcp__plugin_playwright_playwright__*`). It is the
only tool that writes screenshot files; the Browser pane returns inline
images you cannot embed.

- Start `vite-dev-bypass` (port 56300) or a `*-dev` harness route; drive
  the UI with `browser_click` / `browser_type` / `browser_evaluate`.
- Save with `browser_take_screenshot` to `.playwright-mcp/shots/<n>.png`.
  Relative paths resolve against the worktree root, and Playwright can only
  read or write inside the worktree and `.playwright-mcp/`. Copy any fixture
  you upload into one of those roots first.
- Use a fixed viewport (`browser_resize`, e.g. 1440×900) for every slide so
  coordinates stay comparable, and hide harness chrome (state bars, dev
  banners) via `browser_evaluate` before capturing.
- Toasts and other timed UI: override `window.setTimeout` for delays ≥
  1500 ms before triggering them so they stay on screen for the capture.
- Read each saved PNG back to measure pixel positions; do not estimate
  from memory of the page.

## Writing rules (step `text` and `label`)

Text is read on a projector by a teacher mid-lesson. Keep it short and
plain.

- `label`: 1–4 words, the name of the thing (`Import button`, `Nucleus`).
- `text`: 1–2 sentences, 25 words max. State what the thing is or what to
  do. One idea per step; split anything longer into two steps.
- Imperative voice for actions (`Click Import.`), declarative for concepts
  (`The nucleus stores DNA.`).
- No mannered prose or AI-isms. Banned: `Let's`, `Simply`, `Just`,
  `Now that`, `Next, we'll`, `Great!`, `Notice how`, `Feel free`,
  `Keep in mind`, `It's worth noting`, `powerful`, `seamless`, `intuitive`,
  `dive in`, `explore`, `journey`, rhetorical questions, exclamation
  points, em-dashes, and any sentence that restates the previous step.
- No filler openers or closers. Do not welcome, congratulate, or summarize.
  `welcomeMessage`, if used, is one sentence naming the goal.
- Test: read every step aloud. If it sounds like a narrator, cut it.

## Interaction choice

- **"Click this" steps** (buttons, icons, tabs): `spotlight` with
  `showOverlay: "tooltip"`. The player pushes the tooltip outside the lit
  circle and clamps it inside the canvas, so leave `tooltipPosition` at
  `auto` — explicit `left`/`right` end up covering the target.
  `spotlightRadius` is % of the image's smaller side: 8–10 for a small
  icon, 12–15 for a button or tab, 20–25 for a panel.
- **Concept steps** (what a setting means, why a feature exists):
  `text-popover`, no spotlight.
- **Free-standing notes** on a wide area (a table column, a modal):
  `tooltip`.
- While a step is live the player hides its numbered pin; the tooltip's
  anchor dot and the `label` under the spotlight are the only markers.

Exported files default every hotspot to `text-popover` with empty `text`;
when configuring an export, reassign the type per step rather than keeping
the default.

## File schema (GuidedLearningSet)

Required fields:

```jsonc
{
  "id": "any-uuid", // regenerated on import; still required
  "title": "Parts of a Plant Cell",
  "imageUrls": ["data:image/png;base64,…"], // ≥ 1, slide order
  "steps": [
    /* ≥ 1 GuidedLearningStep, see below */
  ],
  "mode": "structured", // "structured" | "guided" | "explore"
  "createdAt": 0, // ms epoch; regenerated on import
  "updatedAt": 0,
  "schemaVersion": 2, // always stamp 2 — matches this doc's image-relative coordinate model
}
```

Optional set-level fields: `description` (string), `imageKinds`
(`("image"|"video")[]` aligned with `imageUrls`; omit unless a slide is a
video), `hotspotPulse` (`"consistent"|"reminder"|"off"`), `imageTransition`
(`"none"|"slide"|"fade"`), `welcomeEnabled` (boolean) + `welcomeMessage`
(string).

`schemaVersion` is **required and must be `2`**: it version-gates renderer
behavior, and only v2 uses the image-relative coordinate model this doc
describes (omitting it would make spotlights render with legacy
container-relative semantics).

Do NOT include: `imagePaths`, `isBuilding`, `authorUid` (all
importer-specific; stripped or rewritten on import). Exports carry
`authorUid` — drop it when editing one.

### Modes

- `structured` — student clicks Next through steps in order. Default choice.
- `guided` — auto-advancing tour (respect `autoAdvanceDuration` per step).
- `explore` — all hotspots visible at once; student clicks any pin. Best for
  labeled-diagram exploration.

### GuidedLearningStep

```jsonc
{
  "id": "step-1", // unique string
  "xPct": 42.5, // 0–100, % of IMAGE width
  "yPct": 61.0, // 0–100, % of IMAGE height
  "imageIndex": 0, // which imageUrls slide this pin is on
  "label": "Nucleus", // short pin label (optional)
  "interactionType": "tooltip",
  "text": "The nucleus stores the cell's DNA…", // tooltip/popover body
}
```

`interactionType` options and their extra fields:

| Type                 | Purpose                              | Extra fields                                                                                        |
| -------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `tooltip`            | Small anchored card (default choice) | `text`, `tooltipPosition` (`above/below/left/right/auto`), `tooltipOffset` (px)                     |
| `text-popover`       | Larger centered text card            | `text`                                                                                              |
| `pan-zoom`           | Zoom into the hotspot                | `panZoomScale` (default 2.5), optional `showOverlay` + `text`                                       |
| `spotlight`          | Dim everything but a circle          | `spotlightRadius` (% of the image's smaller dimension, default 25), optional `showOverlay` + `text` |
| `pan-zoom-spotlight` | Zoom + spotlight combined            | both of the above                                                                                   |
| `audio` / `video`    | Play linked media                    | `audioUrl` / `videoUrl` (YouTube or https URL)                                                      |
| `question`           | Check for understanding              | `question` object (below)                                                                           |

`showOverlay`: `"none" | "popover" | "tooltip" | "banner"` (with
`bannerTone: "blue" | "red" | "neutral"`). Other optional step fields:
`hotspotAlwaysHidden` (find-it exercises), `autoAdvanceDuration` (seconds,
guided mode).

### Questions

```jsonc
"question": {
  "type": "multiple-choice",            // | "matching" | "sorting"
  "text": "Which organelle makes energy?",
  "choices": ["Nucleus", "Mitochondria", "Ribosome"],
  "correctAnswer": "Mitochondria"       // must be one of choices
}
```

Matching uses `matchingPairs: [{ "left": "...", "right": "..." }]`; sorting
uses `sortingItems: ["first", "second", …]` in the correct order.

## Validation rules (the importer enforces these)

- `title` non-empty.
- `imageUrls` has at least 1 entry, with no `blob:` URLs (they are dead
  outside the authoring browser and the importer rejects them).
- `steps` has at least 1 entry, and every step is an object (no nulls).
- Every step has a non-empty string `id`, unique within the file.
- Every step has numeric `xPct` and `yPct` within 0–100. Out-of-range
  `imageIndex` values are clamped on import — still author them correctly.
- `mode` is one of `structured` / `guided` / `explore`.
- Every step's `interactionType` is one of the table above.
- The whole file is one JSON object (not an array).

Author-side rules the importer does not check but the player relies on:
multiple-choice `correctAnswer` must appear verbatim in `choices`;
matching/sorting arrays must be non-empty; `schemaVersion` must be `2`
(the importer passes it through, and without it spotlights render with
legacy container-relative semantics).

## Round-trip guarantee

A file produced by the widget's Export action is a valid input to this skill
(edit it and re-import), and a file authored per this skill re-exports
byte-compatibly after import (ids, timestamps, and image URLs are rewritten
by the importer; everything else passes through).
