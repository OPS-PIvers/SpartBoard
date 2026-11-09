# A tour's Steps view can be public, one tour at a time

An admin can open a published tour's Steps view to anyone with the link, so a tour can be read by a parent, a substitute or another district without an Orono account or the extension. The alternative was district sign-in for every reader, which matches how tour pictures are stored (staff-only, never a URL) and carries no risk of a picture of a district system reaching the open web. Paul chose per-tour public links on 2026-11-09 because a tour that can't be passed to someone outside the district loses much of its use, and accepted a stricter gate in exchange.

A public link can't be recalled once someone has saved the page, so the gate sits before the switch, not after: only admins can turn it on, every picture and all text are shown again for a second confirm, and any later picture change turns the link off until it is confirmed again.

## Consequences

- Authors who are not admins can never make a tour public, also once teachers can author.
- Public tours are served by a function that returns the published steps and pictures; the pictures stay private in Storage and no Firestore or Storage rule opens to the public.
- A public link gives the Steps view only. Running the tour on the site stays staff-only.
- Live tours follow the same gate, because their thumbnails show the author's board.
