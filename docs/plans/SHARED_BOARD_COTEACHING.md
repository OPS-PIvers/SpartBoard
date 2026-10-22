# Co-teaching on shared boards

Status: approved by Paul 2026-10-22 (recommended option for D1-D6; Previews row wording approved).

Goal (Paul, 2026-10-22, "Full co-teaching"): on a Synced board, a colleague sees the same live library
widgets (Activity Wall, Quiz, Video Activity, Guided Learning, Flashcards, Smart Notebook, Projects,
Next Up, Poll), and can moderate, edit and launch them with their own students. View-Only members only
ever see.

## Why it's empty today

Library widgets save only an item id on the board. The item lives in the owner's private
`users/{uid}/...` library (and for Quiz, VA and GL, in the owner's Google Drive). Each member's copy of
the board looks the id up in their own library and finds nothing. The sub share fixes this with a frozen
bundle, which does not update live and is no use for co-teaching.

## Step 1: live view of the Activity Wall (PR #4554, built)

The owner's wall session lists the board's share (`boardShareIds`). Members of that share read the wall
and its approved posts live. Flag `shared-board-live-walls` (admin preview) gates the owner side.

## Decisions for Paul (recommended option first)

- **D1. Who can do more than look.** Recommended: Synced collaborators can moderate, post, edit and
  launch. View-Only members only see. Alternative: every member can do everything.
- **D2. Who can read student posts.** Recommended: only verified district accounts (the rule `/subs`
  already uses), on top of being a board member. Today, anyone holding the link who signs in with any
  non-student Google account can join. Alternative: anyone holding the link.
- **D3. Editing an Activity Wall someone else owns.** Recommended: edits go through a small server
  function that checks share membership and then saves into the owner's library. That works when the
  owner is offline. Alternative: colleagues can't edit the wall's setup, and can only moderate and post.
- **D4. Students from both classes on one wall.** Recommended: one shared wall. A collaborator adds
  their own classes to it, so students from either class post to the same wall and the same link.
  Alternative: each teacher gets a separate copy of the wall for their own class.
- **D5. Quiz, Video Activity and Guided Learning.** These live in the owner's Drive, and results belong
  to whoever assigns them. Recommended: colleagues see the item read-only, and "Assign" makes a linked
  copy in their own library, so their students' results are theirs. Alternative: one shared assignment
  with combined results. That needs shared Drive files and a new results ownership model, which makes it
  the largest option by far.
- **D6. Other widgets (Flashcards, Notebook, Projects, Next Up, Poll).** Recommended: the owner's client
  keeps a live copy of each item's content under the board share, so members can read it. "Use in my
  class" copies it into their library. Alternative: read-only only.

## Slices (each its own PR, behind the same preview flag)

1. Activity Wall live view: #4554.
2. Activity Wall co-moderation for collaborators (this PR): approve, hide, pin, move, delete and post as a teacher
   (rules plus enabling the drawer and composer), and add the D2 district-account check.
3. Activity Wall editing (D3) and shared class targeting (D4).
4. Live content mirror for Flashcards, Notebook, Projects, Next Up and Poll (D6).
5. Quiz, VA and GL: read-only view plus "Assign" making a linked copy (D5).
6. Cleanup: clear access when a widget is removed from a shared board or the owner leaves. Add a
   "<name>'s wall" label for members, which is new wording and needs Paul's OK.

## Effect on collection sharing (COLLECTION_SHARING.md)

Synced and View-Only collections reuse the board share machinery, so their boards inherit both the gap
and this fix with no plan change. Slice 4 there (listeners only for the active board) fits this design,
because only the active board's widgets subscribe. Rules size is about 212 KB of the 249 KB limit after
#4554, and each slice here adds a few hundred bytes.
