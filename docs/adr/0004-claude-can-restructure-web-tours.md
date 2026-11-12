# Claude can add, move and remove web tour steps

Claude, through the SpartBoard connector, can add, move and remove any step in a web tour draft, including steps an admin recorded, not only rewrite their words. The narrower choice was Message steps only, leaving recorded steps untouchable, which matched the earlier rule that structure belongs to the admin. Paul chose the wider one on 2026-11-12 so that one request ("drop the duplicate click, add an intro and a note before we switch to Claude") finishes a tour without a trip back to the editor.

## Consequences

- Every structural edit keeps a revision of the whole step list, targets and picture references included, and a restore brings a removed recorded step back exactly. Picture files of removed steps stay in Storage until the whole tour is deleted, so the revision always has its picture.
- Claude still can't create a recorded step or change where one points: it has no clues or picture to give it. Retargeting stays the admin's **Use this fix**.
- Edits land on the draft; publishing stays the admin's.
- Claude adds intros, outros and switch messages only when asked.
