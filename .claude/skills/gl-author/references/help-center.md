# Help Center Walkthroughs

Use this profile for any "how do I…" set about SpartBoard that teachers open
from the Help Center or a widget's help button. Paul's own Help Center sets
define it, and it overrides the generic defaults in SKILL.md where they
differ. The newest of his sets, "Sharing Boards & Collections with
Substitutes" and "Creating Flashcards and assigning", are the target.

## Where it plays

The Help Center plays a set in a 16:9 box about 900×506 px. A 1440×900
screenshot is fitted by height to about 810 px wide (56%, with bars at the
sides), so a 14 px label shows at about 8 px. Two consequences:

- Capture at **1600×900** (16:9) so the slide fills the box.
- Small controls need zoom (below). Check every slide with
  `scripts/contact_sheet.mjs <file> <dir> --help-size`, which draws it at
  Help size, and then in the Studio's **Help** preview size.

## The plan: one task, in click order

1. Write the task as the teacher would say it: "Share a board with a sub",
   "Make flashcards and assign them". The title is that task. A tour of
   every feature in a widget is not a Help Center set.
2. Trace the real clicks from where the task starts to the visible result.
   Start where the teacher starts, even outside SpartBoard (the Flashcards
   set opens on Quizlet's export screen).
3. One step per click, in order. A menu item needs the step that opens the
   menu before it.
4. Explain an option at the step where the teacher meets it. Paul's
   Flashcards card menu is four steps on one slide: Edit, Present, Share
   link, Share with PLC.
5. **Gotcha pass.** Before writing, list the rules a teacher can't see on
   screen: what doesn't sync, who can do what, what expires, what students
   or subs see. Read the feature's code, release notes in
   `public/changelog.json` and the plan doc for them, and ask Paul if
   unsure. Each gotcha gets its own step, on the slide where it bites.
   Examples from his sets: "If you edit your shared board, you have to
   manually push the changes", "You have to be the set owner",
   "Accessing a set with this URL will not allow progress to be saved".
6. End on the outcome, then at most one step on where to find it later or
   what the other person sees.

Typical length is 15–30 steps over 8–20 slides. Mode is always
`structured`. No questions, audio or video. Use `welcomeMessage` only for a
prerequisite ("You need a class roster first"), never a greeting.

## Screenshots

- Real SpartBoard, full screen: the board with its dock, sidebar and a few
  widgets, with believable fictional data. The teacher should recognise
  their own screen.
- Every pixel is a real component. Never draw an explainer card, a title
  slide, arrows or text into a screenshot, and never build UI that doesn't
  exist in the app. If a state can't be reached, leave the step out or ask.
- One slide per visible state change. Reuse a slide for consecutive steps
  that point at different parts of the same state.

## Steps

- **Click steps on a full-screen slide zoom.** A target under about 70 px
  wide in a 1600 px capture (roughly 40 px at Help size) gets
  `pan-zoom-spotlight` with `panZoomScale` 2 (2.5–3 for an icon), plus
  `showOverlay: "popover"` or `"tooltip"`. Use `spotlight` without zoom only
  for a large target such as a whole widget or dialog. About half of Paul's
  steps zoom.
- **Always a region**, measured from the element's DOM box: `rect` with a
  small `cornerPct` for buttons and menu rows (`cornerPct: 0` for a
  full-width row), `ellipse` for round icon buttons. Never a bare
  `spotlightRadius`.
- **Callout boxes.** Give most callout steps a `calloutBox` in empty space
  beside the region, clear of it, so the connector shows (schemaVersion 5).
  Verify each box in the contact sheet. The Studio is where Paul fine-tunes
  placement, so close enough is fine.
- **One tone per set.** Pick `accent` (reads best on grey board shots) or
  `light`, and use it on every callout step. Don't mix tones.
- **Labels empty.** Paul's sets leave `label` as `""`: the callout is the
  instruction. The live runner shows a generic title for an empty label.
- **Text.** Plain teacher voice, 10–20 words, the control's on-screen name
  in **bold** ("Click **Share with a sub**."). District specifics are good:
  Orono accounts, ClassLink, the building's sub email. A gotcha can be a
  second paragraph after one blank line (`\n\n`), up to 40 words in total
  ("Click **Share**.\n\nSubs can also open it from the substitute portal
  in ClassLink."). Everything else in the SKILL.md writing rules applies.

## Handing it over

Say what Paul should check in the Studio: callout placement at Help and
Projector sizes, and any step where you were unsure of a gotcha. He marks
it for the Help Center in the Studio after import. A set whose controls are
all tagged can also become a live tour; see the conversion section of
[live-tour.md](live-tour.md).
