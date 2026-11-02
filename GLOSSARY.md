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
