# SpartBoard

A classroom dashboard where teachers keep a library of materials and place widgets on boards.

## Importing

**Source**:
Anything a teacher brings content from: a file, a web page, a photo, a Schoology item, a Google Drive file.
_Avoid_: input, origin

**Import**:
The one place a teacher hands SpartBoard a Source and picks what it becomes: a Library item by Conversion, or Reference material on a board. A widget's own import button is a shortcut into it.
_Avoid_: upload, import wizard (for the whole flow)

**Send to SpartBoard**:
The extension button that hands the page the teacher is viewing to Import as a Source.
_Avoid_: clip, capture, share

**Platform reader**:
An exact, no-AI reader for one site's content (Schoology, Google Forms, Quizlet, Edpuzzle…). When it can't read a page, the generic read with AI Conversion takes over.
_Avoid_: scraper, integration

**Send block list**:
The admin-curated URL patterns where Send to SpartBoard is refused and its button hidden, such as the SIS and gradebook pages.
_Avoid_: blacklist, denylist

**Library item**:
A teacher-owned thing in SpartBoard (quiz, question bank, Guided Learning activity, notebook, flashcard set, rubric, video activity, Activity Wall, mini app, board).
_Avoid_: asset, resource, material (when meaning the SpartBoard object)

**Conversion**:
Turning a Source into a new Library item. A parser reads it when the Source has structure, AI otherwise, and the teacher always reviews the result before it saves.
_Avoid_: transform, migration

**Reference material**:
A Source kept as a link or embed on a board rather than copied in.
_Avoid_: attachment

**Attribution**:
The Source URL or file name recorded on a Library item made by Conversion.
_Avoid_: citation, provenance

## Teachers working together

**Team**:
A group of teachers who work together, listed under My Teams. A PLC is one kind of Team, alongside department, mentoring and building groups.
_Avoid_: PLC (for Teams in general), Group (that means joined widgets), My PLCs

**Student team**:
A set of students split up for class work, as in the Randomizer or a roster's saved groups. Always say "student team" when it could be mistaken for a Team.
_Avoid_: Team (unqualified, when talking about students)

**District library**:
Quizzes and question banks that admins publish to chosen buildings, grades or teachers. A teacher's copy stays linked to it, so an admin's correction reaches every copy.
_Avoid_: assessment library, shared library, admin library

## Quizzes

**Blank type**:
How students fill the blanks of a fill-in-the-blank question: Typed, Dropdown (pick from a list on each blank) or Drag (pull words from a shared word bank).
_Avoid_: choice blank, cloze, inline choice, gap match

**Stimulus tab**:
One named source (a reading, picture, PDF or calculator) in the panel beside a question, shown as a tab when the question has two or more.
_Avoid_: source tab, passage tab

**Explanation**:
A teacher's text saying why an answer is right, or why one choice is right or wrong. Students see it only with published results, when the teacher switches it on.
_Avoid_: rationale, feedback (which means a teacher's comments on a student's written answer)

**Mark for review**:
A student's own marker on a question they want to come back to before submitting. Teachers never see it.
_Avoid_: flag (which means a feature flag or a flagged answer)

**Package file**:
One file holding quizzes or question banks with their pictures, which an admin uploads to the District library.
_Avoid_: bundle, export

## Getting Started

**Help Center**:
Where teachers find help inside SpartBoard, and the only home of every Live tour. An admin manages it from Admin Settings; nothing in it reaches teachers until an admin publishes it.
_Avoid_: help library, help resources

**Hidden**:
A Help Center item teachers can't see yet. Everything arrives Hidden, whether recorded or moved in.
_Avoid_: draft, unpublished

**Published**:
A Help Center item teachers can find and open. It is the only other state besides Hidden: publishing an item also publishes its tour.
_Avoid_: live, visible (for the state)

**Unfiled**:
A Help Center item with no category yet. It can't be published until it has one.
_Avoid_: uncategorized, inbox

**Live tour**:
A walkthrough that runs on the real app, pointing at real controls while the teacher uses them. It lives in the Help Center, never in anyone's library.
_Avoid_: walkthrough (for the object), guide (Sparty is the guide), Guided Learning (the tour's authoring format, not what a teacher sees)

**Picture guide**:
A Help Center item made of pictures of the app with spots to click, read step by step. Unlike a Live tour it never touches the real app.
_Avoid_: walkthrough, screenshot guide, Guided Learning activity (in the Help Center)

**Web tour**:
A walkthrough that runs on another website through the SpartBoard Chrome extension, pointing at that site's real controls while the teacher uses them.
_Avoid_: extension tour, site guide

**Message step**:
A Web tour step with no Target: words in the middle of the page with Back and Next, shown on whatever page the learner is on. Used to open or close a tour, or to say what comes next.
_Avoid_: info step, popover, intro card

**Site switch**:
The moment a Web tour's next step is on a different website. The tip offers a button that opens that site in a new tab, and the tour carries on there; the tab left behind stays open.
_Avoid_: redirect, hop, handoff

**Target**:
The control a tour step points at, in a Live tour or a Web tour.
_Avoid_: anchor (in anything an author reads; it is the developer word for a Live tour's registered control), element, hotspot

**Steps view**:
The read-only version of a Live tour or Web tour: every step with its picture and words, opened with "View steps" and readable without running the tour.
_Avoid_: reader, guide, article

**Getting Started**:
The set of Live tours that sets up a new teacher, plus the page in the sidebar that lists them with that teacher's progress. It can always be reopened.
_Avoid_: onboarding (in anything a teacher reads), setup wizard

**Essentials**:
The first Getting Started tours, offered one after another on a teacher's first day.
_Avoid_: required steps, basics

**Next steps**:
The remaining Getting Started tours, taken in any order whenever the teacher likes.
_Avoid_: advanced, optional tours

**Sparty**:
SpartBoard's mascot, who appears on every step of a Live tour as the visible guide. Turning him off removes him and nothing else, so no tour's words depend on him.
_Avoid_: assistant, helper, avatar

## Boards and widgets

**Group**:
Widgets joined so they move together on the board. Started from the chain (link) button on a widget's toolbar. Grouping never changes what a widget does.
_Avoid_: link (for a Connection), bundle

**Connection**:
A teacher-made relationship between widgets on one board that makes one widget act when another does something. Started from the connect button on a widget's toolbar, never from a widget's settings.
_Avoid_: link, nexus, trigger (for the whole relationship)

**Connect mode**:
What the board enters after the Connect button is pressed: widgets that can join glow, and each one the teacher clicks gets the next number until Done.
_Avoid_: link mode, group mode (that is for Groups)

**Sequence**:
A Connection that runs steps in order, where each step waits for the one before it to finish and the whole list can repeat. "Next name, then Shareout timer, then Transition timer, repeat" is one Sequence.
_Avoid_: chain, routine (Instructional Routines is a widget), automation

**Step**:
One numbered card in a Sequence: a widget action, plus any side cards that happen at the same moment. The arrow under it says what moves the Sequence on: the step's widget finishing (a timer ends), right away, the Next button, or a few seconds later.
_Avoid_: event, stage

**Wait step**:
The pause behind an arrow set to "After a few seconds". It is saved as a step with no widget, and the editor shows it on the arrow, not as a card.
_Avoid_: delay, timer step

**Follow**:
A Connection where one widget keeps matching another the whole time, not at a moment: Music plays while a Timer runs, a QR code shows what a Text widget says. In the editor it is a side card beside the step that starts its leader.
_Avoid_: sync, live link, mirror

**Current name**:
In the Randomizer's shuffle list, the highlighted first name that isn't done. "Next name" marks it done and highlights the one after it; locked names are skipped.
_Avoid_: active name, selected student

**Run**:
One pass of a Sequence from the moment a teacher starts any of its steps by hand until it stops. A Run belongs to the device it started on; other open copies of the board only show it.
_Avoid_: session (that is a student activity), playback
