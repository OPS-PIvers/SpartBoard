# Writing a live tour

A live tour walks a teacher through the real SpartBoard board. Each step points at a real control, says what to do with it, and waits for the teacher (or Autopilot) to do it. This guide is for Claude writing tours through the SpartBoard connector. The connector serves it as `get_live_tour_guide`, and `tests/liveTourGuideSync.test.ts` keeps that copy and the examples below in step with the code.

## What done looks like

A tour is done when an admin can publish it without editing it:

- It plays end to end on a fresh board: every step finds its control.
- It takes the path a teacher would take, the shortest real one, and teaches it: every click that opens a menu, panel or dialog is its own step.
- Every step reads like the Help Center: short, plain, in the teacher's words.
- It is staged: the widgets it needs, the library items it works on, the Autopilot default, and its Help Center category.

Don't agree an outline with the admin first. Build the tour, check it with `dry_run`, save it, and hand back a short summary (see Hand-back). Drafts never reach teachers; the admin test-runs and publishes them.

## The workflow

1. **Name the task and the finish line.** One workflow per tour, such as "Make random groups" or "Change the Clock's style and save it as my default". Write down the starting state (usually an empty board), the result the teacher should see at the end, and where it shows up.
2. **Find the controls.** `list_tour_anchors` with no filter lists the namespaces. Then filter by `namespace` (`quiz-editor`), `widget_type` (`schedule`), `surface` (`quiz.editor`) or `search` (`assign`).
3. **Follow the path.** Each anchor's `routes[].path` is the list of anchors to click, in order, from the board to where the anchor shows. Turn every path entry the tour hasn't already clicked into a `click` step, in that order. `reveal` is a tab or menu inside the surface. `needs` says what has to exist first: `widget-on-stage` (put the widget in `tour_widgets`), `library-item` (add a material), `class`, `plc`, `admin`, `live-session`, `student-data`.
4. **Stage it.** Set `tour_widgets`, add `materials` when the tour opens, makes or assigns a library item, and decide `autopilot` (see below).
5. **Dry-run it.** Call `create_live_tour` with `dry_run: true`. Fix every error; read every warning and fix it unless there's a reason not to.
6. **Save.** Call it again without `dry_run`. Pass `help_center` with a category from `list_help_center_categories`. Saving narrates every step whose text is new or changed; `narration_failed` lists any it couldn't, and saving again retries them.
7. **Play it (Claude Code only).** Run the browser run below, fix what fails, and let it upload the step pictures. Then hand back.

To change an existing tour, `get_live_tour`, then `update_live_tour` with `steps` (the whole list, ids kept) or `step_text` (wording only). Update takes the same setup fields and `dry_run`.

## Steps

```jsonc
{
  "id": "open-settings", // stable; update_live_tour matches steps by id
  "label": "Open the settings", // 2 to 5 words, starts with a verb
  "text": "Click the **Settings** gear on the Clock.",
  "tour": {
    "anchor": "widget.settings-opener:clock",
    "action": "click",
  },
}
```

**Actions**

- `click`: the teacher clicks the control; the tour moves on when they do. Use it for buttons, tabs, menu items and anything that opens something.
- `observe`: point at something to notice; the teacher presses Next. Use it for the opening and closing steps (`board.whole`), a result, or a settings row the tour only shows.
- `toggle`: a switch or checkbox, with `value` true or false, the state it should end in.
- `select`: a dropdown, with `value` the option value.
- `type`: a text field, with `value` the text Autopilot types. The tour moves on once the field holds it. Never put a real student's name in it.

**Anchor refs.** Write the id from `list_tour_anchors`, plus `:<type>` when its scope is `widget type` and `:<type>#<key>` when it is `field`. When an anchor lists `keys`, the suffix must be one of them. `settings.field`, `settings.toggle` and `settings.group` refs come from `widget_type` lookups (`settings_fields`).

**Things the runner does for you.** An anchor with `requires` is set up before the runner looks: it expands the dock, selects the widget, restores it, scrolls it into view, or opens the settings drawer on the right tab. A tour that is about a widget's settings can still start with a `click` on `widget.settings-opener:<type>`, so teachers learn where the gear is; after that, every settings step on that widget stays in the open drawer.

**Controls with no anchor.** When `list_tour_anchors` has nothing for a control, use `"anchor": ""` with `fallback` (its ARIA role and English accessible name) and fill `missing_anchor` (where it is and what it does). The step works in English only, and a developer is asked to tag it. Prefer a tagged control nearby when one says the same thing.

**Positions in a list.** A row in the teacher's own library (`#row-1`) points at whatever sits there on their board, so use it only in a tour with materials. Menu items (`#item-2`) and Help Center rows are the same for everyone.

## Staging

- `tour_widgets`: widget types on the board when the tour starts. The runner clears the stage (the teacher's widgets step aside) and adds these. A widget the tour adds from the Dock (`dock.item:<type>`) doesn't belong here.
- `layouts`: leave them out and SpartBoard places the widgets. Set them only when a step needs a widget in a particular spot; give each one a `slot`, and use `slot` on steps only when two widgets of one type are on the board.
- `use_teacher_board: true`: play on the teacher's board as it is, for tours about their own setup. Without it, a widget step fails the dry run unless the widget is staged.
- `materials`: library items the tour works on. With any material the tour runs in a sandbox, where what it saves, assigns or starts stays out of the teacher's real library unless they choose Keep at the end.
  - `created`: the tour makes it (a quiz from scratch). It starts empty.
  - `sample`: a copy of one of your own items (`from_id`), the same for every teacher. Use it for tours that open, edit, assign or run an existing item.
  - `teacher`: the teacher picks one of their own at the start, with your copy (`from_id`) as the fallback. Use it only when working on their real item is the point; its saves are real.

## Autopilot

Autopilot performs each step while the teacher watches. A click that changes the teacher's real account (`persists`) or can't be undone (`destructive`) is handed back to the teacher, unless the tour has materials and the anchor is `sandboxed`.

Set `autopilot` by this rule:

- **Off** for "how do I…" tours, the workflows a teacher will repeat on their own (assign a quiz, make groups, set up the schedule). They learn by clicking.
- **On** for "what's here" tours that show around a widget or a screen without a task to repeat.

## Voice

Write for a busy teacher reading a small card on a projected board.

- One or two sentences, at most 30 words. Lead with the action: "Click **Assign**." Then, if it helps, say what happens: "Click **Assign**. Pick the classes that should see this quiz."
- Second person, present tense, plain words. Name each control in bold exactly as it appears on screen.
- Say why only when the reason isn't obvious: "Turn on **Shuffle questions** so neighbours see a different order."
- The label is 2 to 5 words and starts with a verb: "Open the settings", "Pick a class".
- The first step observes `board.whole` and names the goal: "Let's make a quiz from scratch." The welcome message, when used, is one sentence.
- The last step observes the result or `board.whole` and says what the teacher can do now.
- No em dashes, no "Tip:" or "Note:", no "simply", "just" or "easily", no marketing words, no flag names or mechanics.

## Checks

`dry_run` reports what playback would hit. **Errors refuse the save:**

- an anchor that isn't registered, a per-type or per-field ref without its suffix, or a suffix that isn't one of its `keys`
- a control on a panel no earlier step opens (the error lists the clicks from the board)
- a widget control when that widget isn't staged or added from the Dock first

**Warnings save but need a look:** a step without text, a step without an anchor, a row in the teacher's own list outside a tour with materials, a click Autopilot hands back because it changes the teacher's real account, a `type` or `select` step with no `value` (fine when the answer is the teacher's own, like a calendar ID), a `slot` that no layout or earlier `spawns` binds, and a tour shorter than 3 or longer than 15 steps.

## The browser run (Claude Code)

The dry run reads the map; the browser run plays the tour on a real board. In Claude Code, after saving:

1. Save `get_live_tour`'s result to a file, and call `start_live_tour_picture_upload` for a ticket.
2. Start the `vite-verify` server (the dummy backend, so nothing touches an account), then run `node scripts/run-live-tour.mjs <file> --upload <upload_url> --ticket <ticket>`.
3. Autopilot does every step it can, including ones a teacher run would leave to the teacher. Widgets that need students get a made-up class. Each step is `found`, `missing` (the control never showed) or `left to the teacher` (a step with no value).
4. Fix every `missing` step, save, and run it again. The run uploads each step's picture as its thumbnail; look at a few with `get_live_tour_step_picture`.

A tour that needs a real library item, a PLC or student work can't fully play on the dummy backend; say which steps that leaves unchecked. In claude.ai there is no browser run, so say the tour was dry-run only.

## Hand-back

After saving, tell the admin in a few lines:

- what the tour covers and how many steps it has
- where to find it (the save result says)
- the warnings you left in, and why
- any controls queued for an anchor: the save's `needs_anchors` lists those steps, and the tour waits for them before it's published
- the browser run's result, or that there wasn't one

Then they run it with **Run live on my board (draft)** and publish it in the Studio.

## Examples

Each example is the body of a `create_live_tour` call without its title. The test dry-runs them.

### Change the Clock's look (overview, Autopilot on)

```json tour-example
{
  "tour_widgets": ["clock"],
  "autopilot": true,
  "steps": [
    {
      "id": "intro",
      "label": "Change the Clock",
      "text": "Let's change how the Clock looks on your board.",
      "tour": { "anchor": "board.whole", "action": "observe" }
    },
    {
      "id": "open-settings",
      "label": "Open the settings",
      "text": "Click the **Settings** gear on the Clock.",
      "tour": { "anchor": "widget.settings-opener:clock", "action": "click" }
    },
    {
      "id": "style",
      "label": "Pick a style",
      "text": "Choose a **Clock style** to switch between a digital and an analog face.",
      "tour": {
        "anchor": "settings.field:clock#clockStyle",
        "action": "observe"
      }
    },
    {
      "id": "color",
      "label": "Pick a color",
      "text": "Pick a **Theme color** that's easy to read from the back of the room.",
      "tour": {
        "anchor": "settings.field:clock#themeColor",
        "action": "observe"
      }
    },
    {
      "id": "done",
      "label": "You're set",
      "text": "Your Clock keeps this look on this board.",
      "tour": { "anchor": "board.whole", "action": "observe" }
    }
  ]
}
```

### Start a quiz from scratch (how-to, Autopilot off)

```json tour-example
{
  "tour_widgets": ["quiz"],
  "materials": [
    { "kind": "quiz", "source": "created", "label": "The quiz you make" }
  ],
  "steps": [
    {
      "id": "intro",
      "label": "Make a quiz",
      "text": "Let's start a new quiz from a blank page.",
      "tour": { "anchor": "board.whole", "action": "observe" }
    },
    {
      "id": "new",
      "label": "Start a quiz",
      "text": "Click **New Quiz** in the Quiz widget.",
      "tour": { "anchor": "library-shell.new:quiz", "action": "click" }
    },
    {
      "id": "create",
      "label": "Choose Create",
      "text": "Choose **Create** to write the questions yourself.",
      "tour": {
        "anchor": "library-shell.new-menu-item:quiz#item-1",
        "action": "click"
      }
    },
    {
      "id": "add-question",
      "label": "Add a question",
      "text": "Click **Add question** to add your first question.",
      "tour": { "anchor": "quiz-editor.add-question:quiz", "action": "click" }
    },
    {
      "id": "done",
      "label": "Keep going",
      "text": "Write the question, mark the right answer, and add as many as you need.",
      "tour": { "anchor": "board.whole", "action": "observe" }
    }
  ]
}
```
