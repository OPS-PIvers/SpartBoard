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
