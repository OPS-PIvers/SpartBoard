# A named few can run an AI writing check

A short list of named people can send one student's turned-in writing to an outside AI-writing detector (Pangram) and read the result beside the Writing record's facts. [ADR 0007](0007-writing-is-recorded-in-spartboard-not-google-docs.md) said we buy no plagiarism checker and never label work as suspicious; that still holds for every screen a teacher or student sees. We made this one exception because a concern about a student's work sometimes reaches the district with the record's facts alone not settling it, and a detector's read is a useful extra datapoint in the hands of a few people who weigh it with everything else they know. We chose a tool for a named few over a button in the grader, because a score on a teacher's screen becomes a verdict, and over using Pangram's own site with copied text, because that leaves no trail of who checked whom or why. Decided 2026-11-23; the plan is [AI_WRITING_CHECK.md](../plans/AI_WRITING_CHECK.md).

## Consequences

- Being a site admin does not grant it. A super admin keeps the list, and other admins see neither the setting nor the tool.
- Each check needs a typed reason and is logged with who, when, the piece, and the result's label and percentages. The student's text and the flagged passages are not kept.
- Only the text of a turned-in draft is sent: no names, class, title or prompt. Work in progress is never sent.
- The result is shown as one datapoint and a reason to talk with the student, never as proof. SpartBoard still labels nothing itself.
- Neither the teacher nor the student is told by SpartBoard that a check ran.
- It stays switched off on production until a data privacy agreement with the vendor, district privacy review and updated privacy policy wording are in place.
- Don't widen it to teachers, to whole-class checks or to a second vendor without a new ADR.
