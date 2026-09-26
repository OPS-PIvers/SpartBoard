# Live Tours

A live tour plays a Guided Learning set on the teacher's own board: each
step's callout points at the real control instead of a screenshot. Use it
for "how do I…" help about SpartBoard itself. A lesson about a diagram or
another app is an ordinary set.

## What has to be true for it to run

- The set is a **building set**. An admin imports the file with the Import
  wizard's **Building** option, which is selected by default when a file
  has tour steps. A personal import keeps the bindings but never runs them.
- The admin publishes it in the Studio, or tries it first with **Run live
  (draft)** from the library. Test it on https://spartboard-dev.web.app.
- The `gl-live-tours` preview flag is on for the viewer (admins only until
  it opens to everyone).
- Marking it for the Help Center is a Studio toggle after import; the file
  cannot set it.

## How the runner plays a set

- Once any step has a `tour`, the runner plays **every** step in order.
  Steps with a `tour` anchor their callout to the live element. Steps
  without one show a centered card with the label and text, which suits an
  opening or closing step. A question on such a step shows only its
  question text, so keep question steps out of tours.
- The callout title is the step's `label` and the body is its `text`, with
  the same writing rules as any set. `interactionType`, regions and callout
  styling do not apply on the live board; they still matter for the same
  set played as slides and for the missing-anchor preview.
- `mode: "guided"` runs on autopilot: after the step's reading time the
  cursor glides to the target and clicks it for the teacher, until they
  pause or take over. Any other mode waits for the teacher to click.
- `welcomeEnabled` + `welcomeMessage` open the tour with a one-sentence
  goal.
- If an anchor can't be found, the runner shows that step's slide
  (`imageIndex`, `xPct`, `yPct`, `region`) as a preview and says the
  control is missing. So every tour step still needs a real screenshot of
  that moment with its target placed, exactly as in an app walkthrough.

## The binding

```jsonc
"tour": {
  "anchor": "widget.settings-opener:clock", // ref, see below
  "action": "click",            // or "observe"
  "fallback": { "role": "button", "name": "Settings (Alt+S)" }, // optional
  "teacherMustClick": true,     // optional; defaults from the anchor
  "slot": 0,                    // per-widget anchors only, see Slots
  "spawns": { … },              // this click opens a widget, see Slots
  "layoutKeyframes": [ … ]      // widgets move before this step, see Slots
}
```

- `action: "click"` when the step is "press this": the tour advances when
  the teacher (or autopilot) clicks it. `"observe"` when the step points at
  something to read or notice: the teacher presses Next.
- Autopilot clicks the anchor element itself, so a click step's anchor must
  be the control, not a row or panel around it. A settings field anchor is
  the whole row, so a field step is `observe` ("Turn on 24H Format, then
  click Next").
- Use `observe` for any toggle or checkbox whose starting state you can't
  know: a click flips it, so on a board where it is already on, the tour
  would switch it off. Widget defaults and building settings vary.
- `fallback` is the element's ARIA role and accessible name, matched when
  the `data-tour` tag is not found. Add it for click steps, and take it from
  `fallbackFor(locator)` in `scripts/tour_anchor.mjs`, which reads them the
  way the runner does (an icon button's name is often its `title`).
- `teacherMustClick`: anchors registered `destructive` (closing a widget,
  clearing a board, making a new board) are never clicked by autopilot;
  it demonstrates and waits. Leave the field out to keep that default. Set
  `true` to make autopilot wait on any other step whose click the teacher
  should make themselves.
- Never write `unmapped` or a layout's `appearance`; the recorder owns them.

## Anchor refs

Every tagged element carries `data-tour="<id>"`, with
`data-tour-widget-type` on per-type, per-widget and per-field anchors and
`data-tour-field` on per-field anchors. The registry is
`config/tourAnchors.ts` (about 350 ids): read its `label`s to plan which
controls a tour can point at.

| Anchor kind                | Ref form          | Example                         |
| -------------------------- | ----------------- | ------------------------------- |
| App chrome                 | `id`              | `dock.open-tools`               |
| One per widget type        | `id:type`         | `dock.item:clock`               |
| One per widget window      | `id` or `id:type` | `widget.settings-opener:clock`  |
| One per settings field/row | `id:type#field`   | `settings.field:clock#format24` |

Never type a ref by hand. During capture, get it from the element the
step points at with `refFor(locator)` in `scripts/tour_anchor.mjs`, which
composes it the way the app does, and confirm it with `checkAnchor(page,
ref)` in the state the step starts in. The validator then rejects unknown
ids, missing widget types or field keys, and widget types that don't
exist.

- **Prerequisites are automatic.** An anchor with `requires` (`dock-expanded`,
  `widget-selected`, `widget-restored`, `in-view`) is set up by the runner
  before it looks, so don't add a step just to open the dock or select a
  widget unless teaching that is the point.
- **Panels are not.** An anchor marked `panel` without `requires` (a menu
  item, a library tab) is only visible after something opens it, so an
  earlier step must open it with `action: "click"`.
- **Some chrome only exists in one state.** `dock.open-tools` shows only
  while the dock is collapsed, and dock items far along the dock sit
  outside its scroller at laptop widths. Start the tour from the state its
  first step needs, and let `checkAnchor` at 1440×900 decide what is
  reachable.
- **Positional refs** (`row-<n>`, and list fields such as
  `#items.2.task`) point at whatever sits in that position on the
  teacher's board. Use one only on a row the tour itself creates or sets
  up; otherwise point at the list's container with `observe`. The
  validator warns on every positional ref.

## Slots: widgets the tour sets up

A per-widget anchor (`perWidget` in the registry: a widget's window,
toolbar and settings panel controls) needs to know which widget it means.
Give the set a `tourSetup` or an earlier `spawns`, and give each step on a
per-widget anchor a `slot`. Never put a slot on a per-type or per-field
anchor: those elements carry no widget id, so a slot makes the step
unresolvable; they already match by widget type. The validator rejects it.

```jsonc
"tourSetup": {
  "widgets": ["clock"],   // types the tour adds when the board has none
  "layouts": [
    { "slot": 0, "type": "clock", "xProp": 0.05, "yProp": 0.1, "wProp": 0.25, "hProp": 0.3 }
  ]
}
```

- A layout places a widget as fractions of the board: the board is the
  viewport minus 16 px on every side, so
  `xProp = (x − 16) / (viewportWidth − 32)`, `wProp = width /
(viewportWidth − 32)`, and the same with heights. Measure it with
  `measureWidgetLayout(page, type, slot)` after arranging the widget where
  the screenshots show it.
- At the start the runner binds each slot to the teacher's first widget of
  that type, or adds one, and moves it to the layout for the tour.
- A step whose click opens a new widget (a dock or library item) carries
  `spawns`: a layout with a new slot. Later steps can point into it with
  that slot. Leave that widget type out of `tourSetup.widgets`, or the
  runner adds one at the start and the click adds a second. A tour whose
  only widget is spawned has `"tourSetup": { "widgets": [] }` or none.
  The Help Center's tour health panel doesn't read `spawns` yet and may
  report its later steps as needing a widget; the tour itself runs.
- `layoutKeyframes` on a step moves or resizes slotted widgets
  (`{ slot, xProp, yProp, wProp, hProp }`) before it starts, for a step
  that needs the widget somewhere else.
- A per-widget anchor without a slot matches the first such widget on the
  teacher's board, which is the wrong one when they have two. The
  validator warns.
- A `perWidget` ref may name a type (`id:type`); when it has a slot the
  type must match that slot's widget.

## Checking a tour before handing it over

The capture script is the dry run. For each step, in order and in the state
the step starts in:

1. Compute the ref with `refFor` and assert it with `checkAnchor`; a missing
   or unusable anchor fails the capture.
2. Take the step's screenshot and measure its `region` from the same box.
3. For a click step, click the element and wait for the next state; for an
   observe step, move on.

Then run the validator. The last check is the real one: import the file as
a building set on spartboard-dev and use **Run live (draft)**.
