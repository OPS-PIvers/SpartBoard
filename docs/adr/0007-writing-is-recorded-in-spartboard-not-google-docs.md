# Writing is recorded in SpartBoard, not in Google Docs

A Writing assignment is written in SpartBoard's own editor, where every edit is logged for playback and Focus mode can block paste. We chose this over recording students inside their real Google Docs because Google gives another app no supported way to do it (checked 2026-11-15): the Drive and Docs APIs return only coarse revision snapshots, a page that embeds a Doc can't see or stop anything typed in it, and the extension route used by tools like Draftback depends on an undocumented Docs endpoint and only works on managed Chrome. Originality reports have no API and run only inside Classroom and Google Assignments, so the playback and paste record is our evidence of a student's own work, and we buy no plagiarism checker.

## Consequences

- Writing assignments get their own widget, as quizzes do, and each one is a Library item.
- Students who must work in Docs, Slides or Vids get a copied file per student with no playback and no paste blocking.
- Turned-in writing exports to a Google Doc, which is how a teacher runs a Google originality report on it in Classroom. A student can export their own once the teacher returns it or publishes a grade.
- Students are told their writing is recorded unless the teacher switches the notice off for an assignment. Whether a student can play back their own writing is the teacher's choice, off to start (changed 2026-11-16; it was always on).
- The notice is a teaching choice, not a compliance need: Google Docs keeps revision history without announcing it, and the district's acceptable-use terms already cover school accounts. Settled 2026-11-16; don't reopen it without a new policy reason.
- The record is reported by the student's browser, so it is evidence for a conversation, not proof. SpartBoard states facts and never labels work as suspicious.
- The edit log is deleted each 1 August ([ADR 0010](0010-edit-logs-are-deleted-each-school-year.md)).
- Paste is blocked unless the teacher allows it for an assignment.
- Revisit extension capture in Docs only if Google publishes a supported edit-history API.
