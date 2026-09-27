---
name: gl-author
description: Author or fill in importable SpartBoard Guided Learning activities (.gl.json) from images plus a learning-goal description, including live tours that walk a teacher through the real app. Use when asked to create, generate, or convert a guided learning activity, hotspot lesson, labeled-diagram walkthrough, app-screenshot walkthrough, live tour, or .gl.json file, or to configure the empty hotspots in an exported one. Covers the exact schema, hotspot coordinate rules, interaction choice, tour anchor binding, and validation requirements so the output imports cleanly via the Guided Learning widget's Import wizard.
---

# GL Author

Produce a single self-contained `.gl.json` file that the SpartBoard Guided
Learning widget can import (Library → Import → upload file or paste JSON).
The format is exactly one `GuidedLearningSet` object — the same envelope the
app's own Export action writes — with all slide images embedded as base64
data URIs.

Two worked examples live in [examples/](examples/): a labeled-diagram set
that uses every interaction and question type, and a live tour. Both pass
the validator and the app's importer (`tests/glAuthorExamples.test.ts`).
Read the one closest to the request before starting.

## Workflow

1. **Get the images.** For app walkthroughs and live tours, read
   [references/app-walkthrough.md](references/app-walkthrough.md) and capture
   screenshots with Playwright. For diagrams, read the supplied image at full
   resolution. With no image supplied, draw a flat SVG with no text labels
   (the steps are the labels), render it to PNG with Playwright's Chromium
   (launch notes in the app-walkthrough reference), and keep the geometry in
   one script so pins are computed, not eyeballed. When starting from an
   exported file, decode each `imageUrls` entry and overlay its existing
   pins so you can see what the author meant.
2. **Plan steps.** One hotspot per thing the audience must notice: 4–8
   teaching steps per slide and 4–10 for a single diagram, up to ~16 for an
   app walkthrough, plus any question and media steps. Spread steps across
   slides in teaching order rather than piling them on the first. Add pins
   for controls the story needs (a Save button, a toggle) even if the
   author skipped them.
3. **Place coordinates.** `xPct`/`yPct` are percentages (0–100) **of the
   image itself**: `xPct = 100 * x_pixels / image_width`. Measure on the
   full-resolution image, never a thumbnail; aim at the center of the
   feature. For app walkthroughs, also write a `region` from the Playwright
   element bounds (see Regions): the exact box beats an estimated centre.
4. **Verify placement.** Render each slide with the pins or regions and the
   callouts overlaid and look at it. Every target is covered before you move
   on; estimated pins miss small icons about half the time. For callout
   positions, import `placeCallout`, `placePopover` and `placeBanner` from
   `components/widgets/GuidedLearning/utils/calloutPlacement.ts` into the
   render script (Node strips the types) rather than guessing: a tooltip
   tries below, above, right, then left of the target; a popover is centred
   unless that covers the target; a banner goes below a target in the top
   40% of the slide and above otherwise. Leave callouts on auto placement
   and add a `calloutPin` only when auto placement covers something the
   learner needs for that step. Leave callout width, scale and tone out too
   unless a callout needs them (see Callout size and colour).
5. **Choose the interaction per step** (see Interaction choice) and write
   the text (see Writing rules). Every step gets a `label`.
6. **Bind live-tour steps** when the request is a tour of the real app:
   read [references/live-tour.md](references/live-tour.md).
7. **Embed images.** Convert each image to a base64 data URI
   (`data:image/png;base64,…` or `image/jpeg`), in `imageUrls` in slide
   order. The importer re-hosts data URIs to Drive or Storage. Keep each
   image lean: flat diagrams as indexed (8-bit palette) PNG, photos and
   busy screenshots as JPEG at quality 80–85.
8. **Validate** against the rules below and run
   `node .claude/skills/gl-author/scripts/validate_gl_json.mjs <file>`. Fix
   every error and read every warning, then save as
   `<Title>.<first-8-of-id>.gl.json`.

## How learners play it

The author's `mode` picks how the set starts. Everything below describes
the calmer player (`gl-player-v2`, admin preview today, the future
default); the legacy player notes say what differs.

- `guided` starts in **Watch**: the set plays itself. An animated cursor
  glides from the last target to the next before each step's zoom and
  callout appear. Each step lasts its reading time (label plus text at
  180 words a minute, plus 1.5 s, at least 3 s), times 1.3 when
  `watchPace` is `calm`, divided by the learner's speed (0.5×, 1× or 1.5×).
  Audio and video steps hold until the media ends.
- `structured` starts in **Try**: the learner clicks the target to
  advance. After 5 quiet seconds or 2 misclicks a hint cursor shows the
  target. Learners can switch between Watch and Try.
- `explore` has neither: every pin shows and the learner opens them in any
  order, so each step must make sense on its own.
- A step has a click target when it is a tooltip, spotlight or pan-zoom
  step, or a `text-popover` with a `region`. Audio, video and question
  steps, and text-popovers without a region, advance with Next.
- `autoAdvanceDuration` (seconds) overrides the reading time; `0` means
  wait for Next. Leave it out: the reading time fits the text you wrote.
  `cursor: { "hide": true }` skips the glide into one step, for a step
  whose target is the whole slide.
- Learners can resume where they left off, and a set assigned to a class is
  scored: question answers are graded and teachers see each step's reach
  and misclick heatmap. Write distractors a real misconception would pick.
- Legacy player: Watch has no cursor and every step lasts
  `autoAdvanceDuration` or 5 s, so reading time does not apply. Set
  `autoAdvanceDuration` only when a step needs more than 5 s there and you
  accept it in both players.

## Writing rules (step `text` and `label`)

Text is read on a projector by a teacher mid-lesson. Keep it short and
plain.

- `label`: 1–4 words naming the thing (`Import button`, `Nucleus`). While a
  step is live the label is also the slide's alt text for screen readers,
  so it has to make sense on its own: `Nucleus`, not `This part`.
- `text`: 1–2 sentences, 25 words max. State what the thing is or what to
  do. One idea per step; split anything longer into two steps.
- Audio and video steps show text differently: an audio card shows `text`
  as one plain line cut off after about 40 characters (no markup), and a
  video step shows only its `label`, so put nothing in its `text`.
- Imperative voice for actions (`Click Import.`), declarative for concepts
  (`The nucleus stores DNA.`).
- Formatting: `**bold**` for the one key term a step teaches, at most one
  per step. `[label](https://…)` links only when the learner must open an
  outside page, never in a set meant for the projector. No line breaks,
  lists or headings: text is one paragraph. The 25-word cap counts the
  visible words, not the markup.
- No mannered prose or AI-isms. Banned: `Let's`, `Simply`, `Just`,
  `Now that`, `Next, we'll`, `Great!`, `Notice how`, `Feel free`,
  `Keep in mind`, `It's worth noting`, `powerful`, `seamless`, `intuitive`,
  `dive in`, `explore`, `journey`, rhetorical questions, exclamation
  points, em-dashes, and any sentence that restates the previous step.
- No filler openers or closers. Do not welcome, congratulate, or summarize.
  `welcomeMessage`, if used, is one sentence naming the goal; with
  `welcomeEnabled` on and a blank message the player shows its default
  subtitle.
- Test: read every step aloud. If it sounds like a narrator, cut it.

## Interaction choice

- **"Click this" steps** (buttons, icons, tabs): `spotlight` with
  `showOverlay: "tooltip"` and a `region` matching the control. The player
  lights the region's shape and places the tooltip so it never overlaps the
  region, so leave `tooltipPosition` at `auto`. Without a region,
  `spotlightRadius` is % of the image's smaller side: 8–10 for a small icon,
  12–15 for a button or tab, 20–25 for a panel.
- **Small detail on a big image**: `pan-zoom` (or `pan-zoom-spotlight` when
  the surroundings distract). `panZoomScale` 2–3; a spotlight circle grows
  with the zoom, so pair a zoom with a smaller `spotlightRadius`.
- **Concept steps** (what a setting means, why a feature exists):
  `text-popover`, no spotlight. Add a `region` when the concept belongs to
  one area: the learner then clicks that area in Try.
- **Free-standing notes** on a wide area (a table column, a modal):
  `tooltip`.
- **Warnings and must-read rules** on a zoom or spotlight step:
  `showOverlay: "banner"` with `bannerTone` `red` (danger), `blue`
  (information) or `neutral`. A banner is one short line pinned above or
  below the target, not a place for a paragraph.
- **Narrated or demonstrated moments**: an `audio` or `video` step plays
  linked media over the slide and, in Watch, holds until it ends. `audioUrl`
  is a direct https audio file (MP3 or M4A; iPads cannot play Ogg, and
  Wikimedia Commons offers an `.ogg.mp3` transcode). `videoUrl` is YouTube,
  an uploaded file, or a direct video file URL. A long video holds Watch for
  its whole length, so a set with one usually wants `structured`. A **video slide**
  (`imageKinds[i]: "video"`) is different: the whole slide is a looping
  muted screen recording, with optional `videoTrims[i]` to loop part of it.
  Use a video slide to show motion the learner watches, a video step to
  play a clip with sound.
- **Checks for understanding**: `question` steps (see Questions). Place one
  after the steps that teach its answer, not at the start.
- **Steps with no target** (question, audio, video) still need `xPct`,
  `yPct` and `imageIndex`, and their pin still shows. Put the pin on an
  empty part of the slide the step belongs to and set
  `cursor: { "hide": true }` so Watch doesn't glide to nothing.
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
  "schemaVersion": 3, // 4 for callout size or colour, 5 for a callout box
}
```

Optional set-level fields: `description` (string), `imageKinds`
(`("image"|"video")[]` aligned with `imageUrls`; omit unless a slide is a
video, whose `imageUrls` entry is then an https video URL), `videoTrims`
(aligned with `imageUrls`: `{ "start", "end" }` in seconds with
`0 <= start < end` on a video slide, `null` elsewhere; omit unless a video
slide should loop part of its file), `hotspotPulse` (`"consistent"` ping
ring, `"reminder"` a gentle wiggle every few seconds, or `"off"`),
`imageTransition` (`"none"|"slide"|"fade"`), `welcomeEnabled` (boolean) +
`welcomeMessage` (string), `watchPace` (`"calm"|"standard"`),
`tourSetup` (live tours only, see the live-tour reference).

`schemaVersion` is **required**. Write `3`, or `4` when a step that draws a
callout (see Callout size and colour) sets `calloutWidthPct`, `calloutScale`
or a `light`/`accent` `calloutTone`, or `5` when a callout step sets a
`calloutBox` (with or without a tone). This is the app's own stamping rule,
and the validator rejects a mismatch either way. It version-gates renderer
behavior: 2 and above use the image-relative coordinate model this doc
describes (omitting it would make spotlights render with legacy
container-relative semantics), 3 adds `region`, `calloutPin` and `cursor`,
4 adds the callout size and colour fields, and 5 adds `calloutBox`. A file
stays at the lowest version it needs, so older app versions can still
import it. The validator also accepts `2`, for editing older exports.

Do NOT include: `imagePaths`, `isBuilding`, `authorUid`, `driveFileIds`,
`slideThumbnails`, `helpCenter`, `hasLiveTour` (all importer- or
library-owned; stripped or rewritten on import). Exports can carry some of
them; drop them when editing one. The Import wizard, not the file, decides
whether the set lands in the personal or building library, and an admin
marks a building set for the Help Center in the Studio afterwards.

### Modes

- `structured` — student clicks through steps in order (Try). Default choice.
- `guided` — the set plays itself (Watch); a live tour runs on autopilot.
- `explore` — all hotspots visible at once; student clicks any pin in any
  order. Best for a labeled diagram of standalone parts with no questions or
  media; a diagram lesson that builds up to questions wants `structured`.

### GuidedLearningStep

```jsonc
{
  "id": "step-1", // unique string
  "xPct": 42.5, // 0–100, % of IMAGE width
  "yPct": 61.0, // 0–100, % of IMAGE height
  "imageIndex": 0, // which imageUrls slide this pin is on
  "label": "Nucleus", // short pin label and alt text
  "interactionType": "tooltip",
  "text": "The **nucleus** stores the cell's DNA.", // callout body
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
only when the step has a `region`), `autoAdvanceDuration` (seconds, see How
learners play it), `cursor: { "hide": true }`, `tour` (live tours only).

Fields to pass through untouched when editing an export: `aiDraft: true`
marks AI-drafted text nobody has reviewed; delete it once you have rewritten
that step's text. `narration` with `source: "generated"` is a Studio
voice-over; keep it, and if you change that step's label or text, tell the
user to regenerate it in the Studio. Never write `narration` yourself, and
drop a `recorded` one (the importer does too).

### Regions and callouts (schemaVersion 3)

A `region` is the step's click zone, spotlight shape and zoom focus. Without
one, the pin button is the only target, as in older files. Small regions
are fine on touch screens: the player pads every target to at least 44 px.

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
  points' bounding box and `wPct`/`hPct` to its size. The pin and the zoom
  centre sit at that bounding-box centre, which can fall outside a concave
  shape (a crescent, an L), so trace an outline whose centre lands on the
  part, or use an ellipse.
- `calloutPin: { "xPct", "yPct" }` fixes the callout's centre in image-%.
  Omit it: auto placement tries each side of the region in turn and keeps
  the callout off it. Pin only when the verification render shows auto
  placement is clearly wrong.
- Callout size and colour, below, are schemaVersion 4 fields; `calloutBox`
  is schemaVersion 5.

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
  white text; both keep AA contrast. A tooltip's leader line takes the
  card's colour. There is no free colour, and dark is written by leaving
  the field out.

### Callout box (schemaVersion 5)

`calloutBox: { "xPct", "yPct", "wPct", "hPct" }` gives a callout a fixed box,
all four in image-%: `xPct`/`yPct` is the top-left corner, `wPct`/`hPct` the
size. It applies to the same steps as callout size and colour. It is how
the Studio's drag-and-resize callouts are stored, so use it when a callout
needs an exact spot and size, such as text laid over an empty part of a
diagram or in the margin beside a screenshot.

- `xPct`/`yPct` may fall outside 0–100 (−500 to 500) so a box can sit in the
  area around the screenshot; `wPct`/`hPct` are 1–500.
- Text size is automatic: it fills the box between 12 and 36 px, with the
  title at 1.2× the body. If the text can't fit at 12 px, the box grows
  downward.
- A curved connector runs from the box's nearest edge to the target. A box
  that covers its target hides the connector, so keep the box clear of the
  region and verify it in the render.
- A box replaces `calloutPin`, `calloutWidthPct`, `calloutScale`,
  `tooltipPosition` and `tooltipOffset`; omit those on a step with a box.
  `calloutTone` still applies.
- Leave it out unless a callout needs an exact spot and size; auto placement
  fits most steps and keeps the file at a lower `schemaVersion`.

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
uses `sortingItems: ["first", "second", …]` in the correct order. These are
the only three types; there are no points, hints or multiple correct
answers. Every question needs `text`. Give multiple choice 3–4 unique
choices of similar length, and matching and sorting at least 2 items
(3–5 reads best).

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

Author-side rules the importer does not check but the player relies on,
which the validator enforces: multiple-choice `correctAnswer` must appear
verbatim in `choices`; matching/sorting arrays must be non-empty;
`schemaVersion` must be `3` (or `2` for an older export), or `4` when a step
uses `calloutWidthPct`, `calloutScale` or `calloutTone`, or `5` when a step
uses `calloutBox`; `videoTrims` must match the video slides; every step
has a `label`; `showOverlay`, `bannerTone` and `tooltipPosition` use their
listed values; `panZoomScale` is 1.5–6 and `spotlightRadius` 5–50 (the
Studio's ranges); audio and video steps have https URLs; questions have
text and enough items; step text has no line breaks; `tour` bindings resolve against `config/tourAnchors.ts` (see
the live-tour reference). The importer refuses a file with `schemaVersion`
above 5 and one whose `region`, `calloutPin`, `calloutBox`, callout width,
scale or tone is out of range.

The validator prints warnings for things that import but may play badly:
more than one bold term, banned words and rhetorical questions, audio text
that will be cut off, text on a video step, Ogg audio, multiple choice
without 3–4 choices, generated narration on edited text, and tour refs that
depend on the teacher's board. Resolve each one or say why it stays.

The validator also decodes every embedded image and prints its byte count.
Large base64 strings are often shortened by file previews, so judge
completeness from successful JSON parsing and decoded payloads, not from a
preview window.

## Round-trip guarantee

A file produced by the widget's Export action is a valid input to this skill
(edit it and re-import), and a file authored per this skill re-exports
byte-compatibly after import (ids, timestamps, and image URLs are rewritten
by the importer; everything else passes through, including `tour` and
`tourSetup` on a personal import, where they wait until the set is imported
as a building set).
