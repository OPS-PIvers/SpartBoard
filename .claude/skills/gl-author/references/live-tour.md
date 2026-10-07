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
  cannot set it. The connector's `create_live_tour` can, with `help_center`.
- Through the connector, `get_live_tour` reads a tour (with its publish
  state) and `update_live_tour` saves the full step list as the draft.

## How the runner plays a set

Plan a live tour around a completed task in the real app. Write the
starting state, the clicks that open each subsequent surface, and the
visible outcome before authoring screenshots. A menu item inside a closed
menu needs a preceding click that opens the menu. For every `click` step,
anchor the element that receives the user's click and verify that the
runner advances after that click. Use `toggle`, `select` and `type` for a
switch, a dropdown or a text field, with the `value` the step sets, and
`observe` for checking the final result. Slide `interactionType` is
only the screenshot fallback; it cannot turn an `observe` step into a
click in the live runner. Mix slide interaction types where they fit the
target, but judge the live tour by its `tour.action` and actual UI behavior.

Test the complete sequence in the running app with a fresh workspace and
again with relevant preexisting data. Click each target without forcing it,
type into prompted fields, check each next anchor is visible, and confirm
the intended result in the correct place. When a recording is requested,
capture the actual runner session; a slideshow of screenshots does not
demonstrate the live tour.

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
- Tour sets have no slides. A step's optional picture is
  `tour.thumbnail` (`{ url, anchor, w, h }`); if the anchor can't be found
  and the picture was taken of the same anchor, the runner shows it and
  says the control is missing. Leave `imageUrls` empty and steps without
  `imageIndex`, `xPct`, `yPct`, `region` or callout fields; pictures are
  taken in the app, not authored here.

## The binding

```jsonc
"tour": {
  "anchor": "widget.settings-opener:clock", // ref, see below
  "action": "click",            // or "observe", "toggle", "select", "type"
  "value": true,                // toggle: boolean; select, type: string; else absent
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
- `action: "toggle"` for a switch or checkbox, with `value` the state it
  should end in (`true` is on). Anchor the switch itself:
  `settings.toggle:<type>#<field>` (e.g. `settings.toggle:schedule#autoProgress`).
- `action: "select"` for a dropdown or listbox, with `value` the option's
  value (a native `<select>`'s `value`, or a custom option's `data-value`).
  Anchor the dropdown.
- `action: "type"` for a text field, with `value` the text Autopilot enters.
  Never put a student's name in it: Tour health flags a value that matches
  a roster name, and an empty value.
- Autopilot does not perform these values yet. Guided mode shows the step
  and waits for the teacher, so a switch already in the right state is
  never flipped. A `toggle` or custom-listbox step advances on a click of
  the anchor; a `type` or native `select` step advances when the field
  changes. Next always moves on.
- Autopilot clicks the anchor element itself, so a click step's anchor must
  be the control, not a row or panel around it. A settings field anchor is
  the whole row, so point at the control inside it instead, or make the
  step `observe`.
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
  `widget-selected`, `widget-restored`, `in-view`, `settings-open`) is set up
  by the runner before it looks, so don't add a step just to open the dock or
  select a widget unless teaching that is the point.
- **Settings steps open the drawer themselves.** Every `settings.*` anchor
  carries `settings-open`: the runner selects the widget, opens its settings,
  switches to the tab that holds the field, and scrolls the row to the middle
  of the drawer. Don't add a gear-click (`widget.settings-opener`) step before
  a settings step unless finding the gear is the lesson. The drawer stays open
  across consecutive settings steps on the same widget and closes when a step
  points elsewhere.
- **Other panels are not.** An anchor marked `panel` without `requires` (a
  menu item, a library tab, a `widget-settings.*` control inside a widget's
  own settings) is only visible after something opens it, so an earlier step
  must open it with `action: "click"`.
- **Some chrome only exists in one state.** `dock.open-tools` shows only
  while the dock is collapsed. Start the tour from the state its first
  step needs, and let `checkAnchor` at the capture viewport decide what is reachable.
  The runner scrolls a dock item into view once the dock is open, so in a
  capture script scroll it yourself (`locator.scrollIntoViewIfNeeded()`)
  before `checkAnchor`.
- **Positional refs** (`row-<n>`, and list fields such as
  `#items.2.task`) point at whatever sits in that position on the
  teacher's board. Use one only on a row the tour itself creates or sets
  up; otherwise point at the list's container with `observe`. The
  validator warns on every positional ref.

## Untagged controls

When a control the tour needs has no `data-tour` tag, bind it by name: an
empty `anchor` plus `fallback` from `fallbackFor(locator)`.

```jsonc
"tour": { "anchor": "", "action": "click", "fallback": { "role": "button", "name": "Assign" } }
```

The runner skips straight to the role-and-name match, which is what the
Studio recorder writes for an untagged click. Limits, which the validator
warns about:

- The name is the English label, so the step falls back to its slide for a
  teacher using German, Spanish or French.
- Tour health and Publish list the step as unknown until the control is
  tagged in `config/tourAnchors.ts`. Name each untagged control in the
  handoff so it can be tagged in a code PR.
- A control with no accessible name (a bare date input, an icon button
  without a title) can't be bound this way; it needs a tag.
- An untagged binding has no widget id, so it takes no `slot`.

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
- `layoutKeyframes` on a step moves or resizes slotted widgets
  (`{ slot, xProp, yProp, wProp, hProp }`) before it starts, for a step
  that needs the widget somewhere else.
- A per-widget anchor without a slot matches the first such widget on the
  teacher's board, which is the wrong one when they have two. The
  validator warns.
- A `perWidget` ref may name a type (`id:type`); when it has a slot the
  type must match that slot's widget.

## Converting a screenshot set

A screenshot set converted to a live tour drops its slides: tour sets play
only on the real board, and each step's picture is taken in the app as an
optional thumbnail. Conversion adds `tour` bindings and fixes the step
list; it doesn't start over.

1. Validate the export and render its contact sheets. Write down the task,
   the starting state and each step's target control.
2. Drive the app through the same task with Playwright (app-walkthrough
   runbook) from that starting state. At each step, find the control,
   `refFor` it (or `fallbackFor` if untagged), `checkAnchor` it, then click
   it to reach the next state.
3. Add the steps a live run needs and the slides skipped: a click that
   opens each menu or panel before a step inside it, and `tourSetup` or
   `spawns` for any widget the task uses.
4. Choose each step's action with the rules above: `toggle` for switches,
   `select` for dropdowns, `type` for text fields, `observe` for results,
   `click` for everything else.
5. Steps that can't run live (another site, the sign-in screen, the
   substitute portal, a drag or paste gesture) have no `tour`. The runner
   shows those as a centred card with the text, so put
   them at the start or end, or rewrite them to stand on their own as text.
   A set that is mostly such steps stays a slideshow.
6. Remove question steps; they show only their question text in a tour.
7. Validate, then import as a building set on spartboard-dev and run it
   with **Run live (draft)**. In the handoff, list each untagged control
   and each step that stayed slide-only.

## Checking a tour before handing it over

The capture script is the dry run. For each step, in order and in the state
the step starts in:

1. Compute the ref with `refFor` and assert it with `checkAnchor`; a missing
   or unusable anchor fails the capture.
2. Take the step's screenshot and measure its `region` from the same box.
3. For a click step, click the element and wait for the next state; for a
   toggle, select or type step, set its `value` the way a teacher would;
   for an observe step, move on.

Then run the validator. The last check is the real one: import the file as
a building set on spartboard-dev and use **Run live (draft)**.
