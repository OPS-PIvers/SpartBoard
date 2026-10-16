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
6. **Save.** Call it again without `dry_run`. Pass `help_center` with a `category_id` from `list_help_center_categories`, and `widget_types` for the widgets whose **?** button should offer the tour. Saving narrates every step whose text is new or changed; `narration_failed` lists any it couldn't, and saving again retries them.
7. **Play it (Claude Code only).** Run the browser run below, fix what fails, and let it upload the step pictures. Then hand back.

To change an existing tour, `get_live_tour`, then `update_live_tour` with `steps` (the whole list, ids kept) or `step_text` (wording only). Update takes the same setup fields and `dry_run`.

## Where a tour starts

Every tour starts on the same screen for every teacher, so write each step for this frame:

- The Dock is collapsed at the bottom of the screen, showing **Open Tools**. It sits at the bottom for the whole tour, even for a teacher who keeps it on a side, so never write "on the left" or "on the right" for the Dock.
- The quick-access buttons beside the collapsed Dock are hidden unless a step points at `dock.quick-access-1` or `dock.quick-access-2`.
- The widget library, the sidebar menu, annotation, Dock menus and folders, and every widget's settings are closed, and the board is at 100% zoom.
- Each widget a step adds with `dock.item:<type>` is in the Dock, even for a teacher who hid it or filed it in a folder: the tour puts a button for it at the front of the Dock while it runs.
- A teacher is offered the tour only if they can use every widget it stages or adds.

When the tour ends, the teacher's screen goes back to how they left it.

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
- `select`: a dropdown, segmented control or tab strip, with `value` the option value. Never a button that steps to the next option on each click: an anchor with `cycles` is one, and `cycles` names the control to select instead. A `settings.field` whose `kind` is text, number or a list isn't a choice either.
- `type`: a text field, with `value` the text Autopilot types. The tour moves on once the field holds it. Never put a real student's name in it.

**Anchor refs.** Write the id from `list_tour_anchors`, plus `:<type>` when its scope is `widget type` and `:<type>#<key>` when it is `field`. When an anchor lists `keys`, the suffix must be one of them; when it gives a `key_pattern`, the suffix must match it, and `key_hint` shows examples (quiz option letters are lowercase: `quiz-editor.option:quiz#a`). `settings.field`, `settings.toggle` and `settings.group` refs come from `widget_type` lookups (`settings_fields`).

**The Open Tools step.** Because the Dock starts collapsed, a tour that points at anything inside the Dock (an anchor with `requires: "dock-expanded"`, such as `dock.item:<type>` or `dock.more-widgets`) teaches **Open Tools** first. When no earlier step clicks `dock.open-tools`, saving adds this step before the first Dock step, and `dry_run` shows it too:

```json
{
  "id": "open-dock",
  "label": "Open the Dock",
  "text": "Click **Open Tools** to open the Dock.",
  "tour": { "anchor": "dock.open-tools", "action": "click" }
}
```

The result lists it in `inserted_steps`, with the id of the step it went before. Write your own Open Tools step when you want other wording. The Dock stays open once opened, so one is enough.

**Things the runner does for you.** An anchor with `requires` is set up before the runner looks: it expands the dock, selects the widget, restores it, scrolls it into view, or opens the settings drawer on the right tab. A tour that is about a widget's settings can still start with a `click` on `widget.settings-opener:<type>`, so teachers learn where the gear is; after that, every settings step on that widget stays in the open drawer.

**Controls with no anchor.** When `list_tour_anchors` has nothing for a control, use `"anchor": ""` with `fallback` (its ARIA role and English accessible name) and fill `missing_anchor` (where it is and what it does). The step works in English only, and a developer is asked to tag it. Prefer a tagged control nearby when one says the same thing.

**Editors that save as you go.** The quiz editor autosaves and shows no Save button, so a quiz tour leaves it with `editor.close:quiz` (the **Close** button) before its closing step. `editor.save` is for editors with a Save button, such as the video activity editor.

**Positions in a list.** A row in the teacher's own library (`#row-1`) points at whatever sits there on their board, so use it only in a tour with materials. Menu items (`#item-2`) and Help Center rows are the same for everyone.

## Staging

- `tour_widgets`: widget types on the board when the tour starts. The runner clears the stage (the teacher's widgets step aside) and adds these. A widget the tour adds from the Dock (`dock.item:<type>`) doesn't belong here.
  - A staged Schedule already has three demo rows (Morning Meeting, Math, Reading, with Math as Now), so a row the tour adds is `event-4`.
- `layouts`: leave them out and SpartBoard places the widgets. Set them only when a step needs a widget in a particular spot; give each one a `slot`, and use `slot` on steps only when two widgets of one type are on the board.
- `welcome_enabled` and `welcome_message`: a card before the first step. Leave it off; the opening `board.whole` step names the goal. Turn it on only when the teacher needs to know something before the board changes.
- `use_teacher_board: true`: play on the teacher's board as it is, for tours about their own setup. Without it, a widget step fails the dry run unless the widget is staged.
- `materials`: library items the tour works on. With any material the tour runs in a sandbox, where what it saves, assigns or starts stays out of the teacher's real library unless they choose Keep at the end.
  - `created`: the tour makes it (a quiz from scratch). It starts empty.
  - `sample`: a copy of one of your own items (`from_id`), the same for every teacher. Use it for tours that open, edit, assign or run an existing item.
  - `teacher`: the teacher picks one of their own at the start, with your copy (`from_id`) as the fallback. Use it only when working on their real item is the point; its saves are real.

## Autopilot

Autopilot performs each step while the teacher watches. A click that changes the teacher's real account (`persists`) or can't be undone (`destructive`) is handed back to the teacher, unless the tour has materials and the anchor is `sandboxed`.

It starts off unless `autopilot: true`. Set it by this rule:

- **Off** for "how do I…" tours, the workflows a teacher will repeat on their own (assign a quiz, make groups, set up the schedule). They learn by clicking.
- **On** for "what's here" tours that show around a widget or a screen without a task to repeat.

## Voice

Write for a busy teacher reading a small card on a projected board.

- One or two sentences, at most 30 words. Lead with the action: "Click **Assign**." Then, if it helps, say what happens: "Click **Assign**. Pick the classes that should see this quiz."
- Second person, present tense, plain words. Name each control in bold exactly as it appears on screen.
- Say why only when the reason isn't obvious: "Turn on **Shuffle questions** so neighbours see a different order."
- The label is 2 to 5 words and starts with a verb: "Open the settings", "Pick a class".
- The first step observes `board.whole` and names the goal: "Let's make a quiz from scratch." A welcome message, when there is one, is one sentence.
- The last step observes the result or `board.whole` and says what the teacher can do now.
- No em dashes, no "Tip:" or "Note:", no "simply", "just" or "easily", no marketing words, no flag names or mechanics.

## Checks

`dry_run` reports what playback would hit. **Errors refuse the save:**

- an anchor that isn't registered, a per-type or per-field ref without its suffix, or a suffix that isn't one of its `keys` or doesn't match its `key_pattern`
- `select` on a control that isn't a choice: a cycle button, a switch, or a text, number or list field
- a control on a panel no earlier step opens (the error lists the clicks from the board)
- a widget control when that widget isn't staged or added from the Dock first
- bookends: the first step must observe `board.whole`, and the last step must be an `observe`. On `update_live_tour` with `steps`, this refuses the save only when the stored tour already had them, so a recorded draft without them can still be edited (it comes back as a warning); `step_text` never checks it

**Warnings save but need a look:**

- a step without text, a step without an anchor, a row in the teacher's own list outside a tour with materials, a click Autopilot hands back because it changes the teacher's real account, a `type` or `select` step with no `value` (fine when the answer is the teacher's own, like a calendar ID), a `slot` that no layout or earlier `spawns` binds, and a tour shorter than 3 or longer than 15 steps
- voice: text over 30 words, an em dash, a "Tip:" or "Note:" prefix, "simply", "just" or "easily"; a label under 2 or over 5 words, or one starting with "a", "an", "the", "your" or "this"
- staging: a widget in `tour_widgets` that a step also adds with `dock.item` (the board ends up with two), a staged widget no step points at (unless every step observes `board.whole`), and a material no step opens
- panels: a step inside a panel an earlier step closed (with its **Close**, **Cancel** or **Save** button) when no step opens it again, and settings steps on two different widgets back to back, which makes the runner shut the first drawer with no step showing it

## The browser run (Claude Code)

The dry run reads the map; the browser run plays the tour on a real board. In Claude Code, after saving:

1. Save the result of `get_live_tour` with `for_browser_run: true` to a file (it keeps each sample material's content), and call `start_live_tour_picture_upload` for a ticket.
2. Start the `vite-verify` server, the dummy backend on port 56320, so nothing touches an account. In the Claude desktop app use `preview_start` with that name; in a terminal run `pnpm run dev:verify` in the background. Then run `node scripts/run-live-tour.mjs <file> --upload <upload_url> --ticket <ticket>`.
3. Autopilot does every step it can, including ones a teacher run would leave to the teacher. Widgets that need students get a made-up class. Each step is `found`, `missing` (the control never showed) or `left to the teacher` (a step with no value).
4. Fix every `missing` step with `update_live_tour` (dry-run it first, as before). Then save `get_live_tour` with `for_browser_run: true` over the same file and rerun. A ticket lasts 30 minutes and 20 upload requests (up to 8 pictures each); when the upload says it is expired or used up, call `start_live_tour_picture_upload` again. The run uploads each step's picture as its thumbnail; look at a few with `get_live_tour_step_picture`.

**From a cloud session.** The egress proxy needs Node told about it: run the script with `NODE_USE_ENV_PROXY=1` and `NODE_EXTRA_CA_CERTS` set to the proxy's CA bundle. `upload_url` is the direct functions URL, which the proxy allows; `upload_url_fallback` is the same endpoint on the web.app site, for a machine that can reach only that. When Playwright's expected Chromium isn't installed, the runner tries Chrome and then any Chromium or headless shell it finds; set `LIVE_TOUR_CHROMIUM` to an executable to choose one. It never downloads a browser.

A tour that needs a real library item, a PLC or student work can't fully play on the dummy backend; say which steps that leaves unchecked. In claude.ai there is no browser run, so say the tour was dry-run only.

## Hand-back

After saving, tell the admin in a few lines:

- what the tour covers and how many steps it has
- where to find it (the save result says)
- the warnings you left in, and why
- any controls queued for an anchor: the save's `needs_anchors` lists those steps. Publishing isn't blocked, but those steps fail for teachers using another language, so recommend waiting until they're tagged and rebound
- the browser run's result, or that there wasn't one

In claude.ai, where there is no browser run, end the hand-back with: "Play it once from the Guided Learning library (Type: **Live tours**, **Edit**), add a **Note for Claude** on any step that's wrong, then ask me to finish it."

Then the admin opens it from the Guided Learning library (Type: **Live tours**, then **Edit**), which opens it on the board, plays it there, and presses **Publish tour** and then **Show in Help** in the **Teachers' version** panel. **Show in Help** is the same as turning on Visible in Admin Settings > Help Center. It stays on, so after a later edit the admin only presses **Publish changes**.

## Finish pass

When the admin has played the tour or left notes ("finish the tour", "I played it", "I left notes"), make one pass that leaves it ready to publish:

1. Call `get_live_tour`. Read `review_note` on the tour and on each step, `last_playtest`, and `health` when the tour is published.
2. Fix every step `last_playtest` marks `missing`: follow its anchor's `routes` again, rebind it, or add the click that opens its panel. A step `left` to the teacher needs a `value` unless the choice is theirs. When `stale` is true the steps changed after that play, so trust its results only for steps you haven't changed since.
3. Before rewriting a step's text, look at its picture with `get_live_tour_step_picture`.
4. Act on each note. In `health`, a step many runs missed (`missed`) or left from (`most_left_from`) is worth the same look.
5. Dry-run, then save with `update_live_tour`, passing `resolved_notes` with each note you dealt with: the step id, or `"tour"` for the tour's own note.
6. Hand back what changed in a few lines, and any note you left open with the reason. Open notes stay for the next pass.

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
      "text": "Under **Display Style**, choose **LCD Panel** for a classic digital look.",
      "tour": {
        "anchor": "settings.field:clock#clockStyle",
        "action": "select",
        "value": "lcd"
      }
    },
    {
      "id": "color",
      "label": "See the colors",
      "text": "**Color Palette** sets the color of the numbers. A dark color on a light board reads best from the back of the room.",
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
      "id": "close",
      "label": "Close the editor",
      "text": "Click **Close**. Your quiz saves as you go, so there's nothing else to save.",
      "tour": { "anchor": "editor.close:quiz", "action": "click" }
    },
    {
      "id": "done",
      "label": "Keep going",
      "text": "Your new quiz is in the Quiz widget. Open it any time to write the questions and mark the answers.",
      "tour": { "anchor": "board.whole", "action": "observe" }
    }
  ]
}
```
