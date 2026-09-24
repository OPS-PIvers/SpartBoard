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

1. **Get the images.** For app walkthroughs, read
   [references/app-walkthrough.md](references/app-walkthrough.md) and capture
   screenshots with Playwright. For diagrams, read the supplied image at full
   resolution. When starting from an exported file, decode each `imageUrls`
   entry and overlay its existing pins so you can see what the author meant.
2. **Plan steps.** One hotspot per thing the audience must notice. 4–10
   steps for a diagram; up to ~16 for an app walkthrough. Add pins for
   controls the story needs (a Save button, a toggle) even if the author
   skipped them.
3. **Place coordinates.** `xPct`/`yPct` are percentages (0–100) **of the
   image itself**: `xPct = 100 * x_pixels / image_width`. Measure on the
   full-resolution image, never a thumbnail; aim at the center of the
   feature. For app walkthroughs, also write a `region` from the Playwright
   element bounds (see Regions): the exact box beats an estimated centre.
4. **Verify placement.** Render each slide with the pins or regions and the
   callouts overlaid and look at it. Every target is covered before you move
   on; estimated pins miss small icons about half the time. Leave callouts on
   auto placement and add a `calloutPin` only when auto placement clearly
   covers something the learner needs. Leave callout width, scale and tone
   out too unless a callout needs them (see Callout size and colour).
5. **Choose the interaction per step** (see Interaction choice) and write
   the text (see Writing rules). Every step gets a `label`.
6. **Embed images.** Convert each image to a base64 data URI
   (`data:image/png;base64,…` or `image/jpeg`), in `imageUrls` in slide
   order. The importer re-hosts data URIs to Storage.
7. **Validate** against the rules below and run
   `node .claude/skills/gl-author/scripts/validate_gl_json.mjs <file>`, then
   save as `<Title>.<first-8-of-id>.gl.json`.

## Screenshots (app walkthroughs)

Prefer the Playwright MCP (`mcp__plugin_playwright_playwright__*`) when it is
available. Tool availability varies between clean sessions, so the local
`@playwright/test` fallback is supported and must not modify tracked package
files. Do not use the Browser pane for deliverable screenshots: it may not
reach localhost and its inline images cannot be embedded reliably.

The app-walkthrough reference covers clean-session setup, deterministic mock
data, dev-only harnesses, local Chromium fallback, semantic waits, coordinate
measurement, screenshot verification, and cleanup. Keep captures in
`.playwright-mcp/shots/`, use one fixed viewport such as 1440×900, and measure
hotspots from the saved full-resolution PNGs or Playwright element bounds.

Repository code may retain internal names such as `RandomWidget` or widget
type `random`. Use the client-facing product name requested by the user in the
guide title, labels, and prose.

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
  `showOverlay: "tooltip"` and a `region` matching the control. The player
  lights the region's shape and places the tooltip so it never overlaps the
  region, so leave `tooltipPosition` at `auto`. Without a region,
  `spotlightRadius` is % of the image's smaller side: 8–10 for a small icon,
  12–15 for a button or tab, 20–25 for a panel.
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
  "schemaVersion": 3, // 4 only when a step uses callout size or colour
}
```

Optional set-level fields: `description` (string), `imageKinds`
(`("image"|"video")[]` aligned with `imageUrls`; omit unless a slide is a
video), `hotspotPulse` (`"consistent"|"reminder"|"off"`), `imageTransition`
(`"none"|"slide"|"fade"`), `welcomeEnabled` (boolean) + `welcomeMessage`
(string), `watchPace` (`"calm"|"standard"`; calm slows Watch playback).

`schemaVersion` is **required**. Write `3`, or `4` when a step that draws a
callout (see Callout size and colour) sets `calloutWidthPct`, `calloutScale`
or a `light`/`accent` `calloutTone`. This is the app's own stamping rule, and
the validator rejects a mismatch either way. It version-gates renderer behavior: 2 and above use the
image-relative coordinate model this doc describes (omitting it would make
spotlights render with legacy container-relative semantics), 3 adds
`region`, `calloutPin` and `cursor`, and 4 adds the callout size and colour
fields. A file stays at 3 when it doesn't need 4, so older app versions can
still import it. The validator also accepts `2`, for editing older exports.

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
`hotspotAlwaysHidden` (find-it exercises; the hidden target is clickable
only when the step has a `region`), `autoAdvanceDuration` (seconds, guided
mode), `cursor: { "hide": true }` (skip the animated cursor for this step).

### Regions and callouts (schemaVersion 3)

A `region` is the step's click zone, spotlight shape and zoom focus. Without
one, the pin button is the only target, as in older files.

```jsonc
"region": {
  "shape": "rect",   // | "ellipse" | "polygon"
  "wPct": 8.4,       // box width, % of image width, centred on xPct
  "hPct": 5.1,       // box height, % of image height, centred on yPct
  "cornerPct": 20    // rect only: corner radius, % of the shorter side, 0–50
}
```

- The box `xPct ± wPct/2`, `yPct ± hPct/2` must stay inside 0–100.
- Polygons (irregular map regions, diagram parts) add `points`: 3–24
  `{ "x", "y" }` vertices in image-%. Set `xPct`/`yPct` to the centre of the
  points' bounding box and `wPct`/`hPct` to its size.
- `calloutPin: { "xPct", "yPct" }` fixes the callout's centre in image-%.
  Omit it: auto placement keeps the callout off the region. Pin only when
  the verification render shows auto placement is clearly wrong.
- Callout size and colour, below, are schemaVersion 4 fields.
- Never write `narration` (audio lives in Storage and is made in the Studio)
  or `tour` (live-tour bindings are made by the recorder).

### Callout size and colour (schemaVersion 4)

Three optional step fields restyle a callout. They apply to `tooltip` and
`text-popover` steps, and to a `showOverlay` of `popover` or `tooltip` on
pan-zoom and spotlight steps; the validator rejects them anywhere else.

| Field             | Value                                       | Absent means                    |
| ----------------- | ------------------------------------------- | ------------------------------- |
| `calloutWidthPct` | 10–95, % of the **stage** width (not image) | auto width, text sets the width |
| `calloutScale`    | 0.75–2, multiplies text size and padding    | 1                               |
| `calloutTone`     | `"light"` or `"accent"`                     | dark (today's card)             |

- Leave all three out unless a callout needs one, the same as `calloutPin`.
  Auto sizing fits most text, and any of them forces `schemaVersion` 4.
- Width tracks the screen, not the zoom: on a pan-zoom step a pinned callout
  moves with the image but keeps its width. Height always fits the text.
- `light` is a white card with dark text, `accent` a brand-blue card with
  white text. A tooltip's leader line takes the card's colour. There is no
  free colour, and dark is written by leaving the field out.

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
matching/sorting arrays must be non-empty; `schemaVersion` must be `3`
(or `2` for an older export; the importer passes it through, and without it
spotlights render with legacy container-relative semantics), or `4` when a
step uses `calloutWidthPct`, `calloutScale` or `calloutTone`. The importer
refuses a file with `schemaVersion` above 4 and one whose `region`,
`calloutPin`, callout width, scale or tone is out of range.

The validator also decodes every embedded image and prints its byte count.
Large base64 strings are often shortened by file previews, so judge
completeness from successful JSON parsing and decoded payloads, not from a
preview window.

## Round-trip guarantee

A file produced by the widget's Export action is a valid input to this skill
(edit it and re-import), and a file authored per this skill re-exports
byte-compatibly after import (ids, timestamps, and image URLs are rewritten
by the importer; everything else passes through).
