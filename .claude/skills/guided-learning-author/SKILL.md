---
name: guided-learning-author
description: Author importable SpartBoard Guided Learning activities (.gl.json) from an image plus a learning-goal description. Use when asked to create, generate, or convert a guided learning activity, hotspot lesson, labeled-diagram walkthrough, or .gl.json file. Covers the exact schema, hotspot coordinate rules, and validation requirements so the output imports cleanly via the Guided Learning widget's Import wizard.
---

# Guided Learning Author

Produce a single self-contained `.gl.json` file that the SpartBoard Guided
Learning widget can import (Library tab → Import → upload file or paste JSON).
The format is exactly one `GuidedLearningSet` object — the same envelope the
app's own Export action writes — with all slide images embedded as base64
data URIs.

## Workflow

1. **Read the source image(s).** Actually look at the image before placing
   hotspots — coordinates must land on the real features.
2. **Plan steps from the learning goal.** One hotspot per concept the teacher
   wants students to notice. 4–10 steps is the sweet spot.
3. **Place coordinates.** `xPct`/`yPct` are percentages (0–100) **of the
   image itself**, not the screen: `xPct = 100 * x_pixels / image_width`,
   `yPct = 100 * y_pixels / image_height`. Place the point at the center of
   the feature. Double-check by describing what sits at that spot.
4. **Write tooltip text.** 1–3 sentences, student-facing, grade-appropriate,
   directly serving the stated learning goal. No meta-commentary.
5. **Embed images.** Convert each image to a base64 data URI
   (`data:image/png;base64,…` or `image/jpeg`). Put them in `imageUrls` in
   slide order. Remote `https:` URLs import too, but embedded is preferred.
6. **Validate** against the rules below, then save as
   `<Title>.<first-8-of-id>.gl.json`.

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
}
```

Optional set-level fields: `description` (string), `imageKinds`
(`("image"|"video")[]` aligned with `imageUrls`; omit unless a slide is a
video), `hotspotPulse` (`"consistent"|"reminder"|"off"`), `imageTransition`
(`"none"|"slide"|"fade"`), `welcomeEnabled` (boolean) + `welcomeMessage`
(string), `schemaVersion` (number — **omit it**; it version-gates renderer
behavior and absent means the stable legacy semantics).

Do NOT include: `imagePaths`, `isBuilding`, `authorUid` (all
importer-specific; stripped or rewritten on import).

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

| Type                 | Purpose                              | Extra fields                                                                    |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `tooltip`            | Small anchored card (default choice) | `text`, `tooltipPosition` (`above/below/left/right/auto`), `tooltipOffset` (px) |
| `text-popover`       | Larger centered text card            | `text`                                                                          |
| `pan-zoom`           | Zoom into the hotspot                | `panZoomScale` (default 2.5), optional `showOverlay` + `text`                   |
| `spotlight`          | Dim everything but a circle          | `spotlightRadius` (default 25), optional `showOverlay` + `text`                 |
| `pan-zoom-spotlight` | Zoom + spotlight combined            | both of the above                                                               |
| `audio` / `video`    | Play linked media                    | `audioUrl` / `videoUrl` (YouTube or https URL)                                  |
| `question`           | Check for understanding              | `question` object (below)                                                       |

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
- `imageUrls` has at least 1 entry; `steps` has at least 1 entry.
- Every step has numeric `xPct` and `yPct` (0–100). Out-of-range
  `imageIndex` values are clamped on import — still author them correctly.
- The whole file is one JSON object (not an array).

Author-side rules the importer does not check but the player relies on:
multiple-choice `correctAnswer` must appear verbatim in `choices`;
matching/sorting arrays must be non-empty.

## Round-trip guarantee

A file produced by the widget's Export action is a valid input to this skill
(edit it and re-import), and a file authored per this skill re-exports
byte-compatibly after import (ids, timestamps, and image URLs are rewritten
by the importer; everything else passes through).
