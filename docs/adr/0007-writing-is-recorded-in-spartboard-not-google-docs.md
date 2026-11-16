# Writing is recorded in SpartBoard, not in Google Docs

A Writing assignment is written in SpartBoard's own editor, where every edit is logged for playback and Focus mode can block paste. We chose this over recording students inside their real Google Docs because Google gives another app no supported way to do it (checked 2026-11-15): the Drive and Docs APIs return only coarse revision snapshots, a page that embeds a Doc can't see or stop anything typed in it, and the extension route used by tools like Draftback depends on an undocumented Docs endpoint and only works on managed Chrome. Originality reports have no API and run only inside Classroom and Google Assignments, so the playback and paste record is our evidence of a student's own work, and we buy no plagiarism checker.

## Consequences

- Students who must work in Docs, Slides or Vids get a copied file per student with no playback and no paste blocking.
- A finished Writing assignment exports to a Google Doc, which is how a teacher runs a Google originality report on it in Classroom.
- Recording is for learning evidence first: students are told it happens and can play back their own writing. Blocking is something a teacher switches on per assignment.
- Revisit extension capture in Docs only if Google publishes a supported edit-history API.
