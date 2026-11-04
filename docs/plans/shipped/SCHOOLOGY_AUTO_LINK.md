# Schoology auto-link: find a teacher's Schoology sections for their classes

Probed read-only on 2026-11-04 (Schoology REST with the SIS Connect key, ClassLink OneRoster, prod Firestore). Built 2026-11-04 behind `schoology-tool-columns`: `functions/src/lti/findSchoologySections.ts` and `components/classes/SchoologyFindCourses.tsx`. Both open questions took the proposal: sections with no SpartBoard class stay hidden, and there is no semester banner yet.

## Goal

A teacher clicks **Find my Schoology courses** and sees each of their SpartBoard classes paired with the Schoology section for it, then confirms all the pairs in one click. Nobody pastes course URLs or waits for a student launch, and S1/S2 mix-ups like the one on 2026-11-04 (Jessica Curtis's classes linked to her S2 sections) can't happen, because the pairing comes from the SIS, not from a title.

## What the probe proved

All calls were GETs. Nothing was written. No student names, emails or response bodies were logged, only counts.

1. **The SIS id is on the section, and it is the ClassLink class id.** `GET /v1/users/{uid}/sections` and `GET /v1/sections/{id}` return `section_school_code`, which equals the OneRoster class `sourcedId`, which SpartBoard stores as the roster's `classlinkClassId`. For Jessica, all 5 of her current `lti_course_links` matched exactly, for example section `8497590559` "BIOLOGY A: (S1) Curtis, J BIOLOGY A(5)" has `section_school_code` `27FA3F6D-0469-4F6B-B69C-ED2172A99220`, the `classlinkClassId` of roster `DNF7f57E0odJwrlspMns`. `section_code` is empty and there is no `sis_id` field. `course_code` is `{schoolSourcedId}_{courseSourcedId}`.
2. **A class id leads straight to its section, no teacher lookup needed.** `GET /v1/sections/ext/{classlinkClassId}` returns the section (200) or 404 when Schoology has no section for that class (her TEACHER ASSISTANT A(3) roster, a class with no Schoology course, returned 404, as did a made-up id). `GET /v1/sections?section_school_codes={id}` does the same as a list (`total: 1`). `section_school_code=` (singular) is 403.
3. **Grading periods tell S1 from S2.** Each section carries `grading_periods: [id]`. `GET /v1/gradingperiods/{id}` returns `title`, `start`, `end`: `1170969` = "HS Semester 1 (26-27)" 2026-09-01..2027-01-22, `1170971` = "HS Semester 2 (26-27)" 2027-01-26..2027-06-03. The ClassLink class's term (`academicSessions/{id}`, "[S1] Orono High School term", same dates) agrees. Section titles also start with `(S1)`/`(S2)`, but the S2 sections are titled just "(S2) BIOLOGY B" today, with no period number, so titles alone can't pair them.
4. **A teacher's Schoology uid can be found from their email when they are in OneRoster.** OneRoster `GET /users?filter=email='{email}'` gives the teacher's `sourcedId`; Schoology stores it as the user's `school_uid`, so `GET /v1/users/ext/{sourcedId}` (or `GET /v1/users?school_uids={sourcedId}`) returns the Schoology user. Jessica: OneRoster `B0961D9B-…` → Schoology uid `68750287`, `primary_email` matches. `GET /v1/users/68750287/sections` then lists all 11 of her sections: 5 S1 (all linked), 5 S2 (not yet in her SpartBoard rosters), and the "Orono High School Staff" group. Schoology itself has **no email lookup**: `/users?primary_email=`, `?email=` and `?usernames=` are ignored (they return the whole district, 11,235 users), and `/search?type=user` searches all of Schoology (it returned a non-Orono account for her email, and 403s on other schools' users).
5. **Paul has no OneRoster record**, so the email route finds nothing for him, and the REST key's own `/users/me` is the "aPaul Ivers" admin account (`school_uid` `08122334`), not his teacher account. His only roster is a test class. This doesn't matter for the design below, which starts from classes, not from the teacher.
6. **Enrollments match OneRoster by id, without emails.** REST enrollment rows carry `school_uid`, the OneRoster user `sourcedId`. Section `8497590559`: 24 active learners, 24 OneRoster students in its class, 24 matched. Against a different class of hers (BIOLOGY A(6)): 0 of 19. So student overlap is a clean check if it is ever needed, but with the SIS id match it isn't needed for pairing.
7. **Sections can have several admins.** Section `8497590559` lists three `admin: 1` enrollments: Jessica plus two other staff accounts, one from another building. Whoever is an admin of a section sees it in `/users/{uid}/sections`, which is one more reason to start from the caller's own classes and to keep the NRPS instructor check.

## Design

### D1. Start from the caller's classes

`ltiFindSchoologySectionsV1` (callable, teacher only, same flag gate as `ltiLinkSectionByUrlV1`) reads the caller's rosters with a `classlinkClassId` (`ownedLinkableRosters`) and, a few at a time, calls `GET /sections/ext/{classlinkClassId}`. A 404 means "no Schoology course for this class". The teacher's Schoology uid isn't needed, so admins without a OneRoster record and co-taught sections work the same way. Test-class rosters are skipped (no SIS id).

### D2. Ownership checks stay

Before a pair is offered, and again when it is confirmed, each section passes the current link rules:

- The caller's email is an active Instructor in the section's NRPS roster (`isActiveInstructor`). The REST `admin` flag isn't enough on its own, since other staff can be section admins (fact 7).
- A section already linked by another teacher is shown as "Linked by another teacher" and can't be taken (`already-exists`, as today).
- The roster must be the caller's own. The SIS match (`section_school_code === classlinkClassId`) replaces the student-overlap check for these pairs. The overlap check stays for the paste-a-URL path.

### D3. The confirmation list

The Link Schoology dialog gets **Find my Schoology courses**. It lists one row per class: the class name, the suggested section title, its grading period title, and a checkbox (on by default when the section isn't linked yet). Rows show "Already linked" for a class whose link already points at that section, "No Schoology course" for a 404, and "Linked by another teacher" where that applies. **Link selected** writes them through the existing link path, which since #5155 replaces a class's old link.

### D4. Semester change

S2 classes reach SpartBoard when ClassLink syncs them into the teacher's rosters, and each one finds its own S2 section by id (fact 3), so the S1/S2 question answers itself. The S1 links keep working for S1 grades. Running **Find my Schoology courses** again at the semester change is enough. Optionally, the Gradebook or Link dialog shows a banner "You have classes without a Schoology link" when a roster with a `classlinkClassId` has no `ltiContextId` and its section's grading period has started. A nightly job isn't proposed: it would write links nobody confirmed.

### D5. Calls and limits

Per run: one REST GET per ClassLink roster (teachers have about 5–12), one NRPS read per matched section, one grading-period GET per distinct period (cache by id). Use `restClient.ts` with two new readers, `getSectionBySisId(classId)` (404 → null) and `getGradingPeriod(id)`, both guarded by `assertId`-style checks (a GUID pattern for the class id). Never log response bodies.

## PR

One PR behind the existing `schoology-tool-columns` flag (admin, on for Paul first): the two REST readers with tests, the callable with tests (SIS match, 404, foreign link, not an NRPS instructor, test-class skipped, already linked), the dialog button and list with `tourAttr` anchors, and a help note. The PR description names the flag and the admin path.

## Open questions for Paul

- Should the dialog also offer sections whose class isn't in SpartBoard yet (the S2 sections before ClassLink syncs them)? The probe says they'd have nothing to link to, so the proposal hides them.
- Banner at the semester change (D4): worth it, or is the button enough?
