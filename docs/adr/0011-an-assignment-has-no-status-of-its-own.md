# An assignment has no status of its own

An assignment's state is worked out from two things it already stores: each class's access (Ready, Scheduled, Open, Paused or Closed) and its grading and publishing. It is Done when every class is Closed, nothing is waiting for a grade and its scores are published; otherwise it is Active. We chose this over the single overall status the tabs used before (active, paused or ended), which could not describe a quiz closed for one class, open for another and not yet given to a third, and so needed a teacher to press "End" before a finished quiz left In Progress. We also chose it over one long chain running from Ready to Published, because access is per class, grading is per student and publishing is per assignment, and one value cannot be true for all three.

## Consequences

- There is no "End all". A teacher closes a class; the assignment finishes when its last class closes and its scores are out.
- The lists that show assignments derive Active or Done from the same helper, so they cannot disagree.
- The stored overall status stays for now and is written to match (opening a class marks it active, closing the last one ends it), because the PLC list, the substitute portal and My Assignments still read it.
- Old assignments need no migration: their overall status is read as one class.
- A teacher can still move an assignment to Done by hand, which closes every class.
- Plan: `docs/plans/ASSIGNED_TAB.md`.
