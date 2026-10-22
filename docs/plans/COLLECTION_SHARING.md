# Collection sharing: Synced and View-Only

Status: draft, waiting on Paul's decisions (D1-D4) and wording OK (W1). Requested 2026-10-22.

## Goal

The collection Share dialog offers the same three choices as the board Share dialog:
**Synced**, **View-Only** and **Make a copy**, plus the existing **Share with a sub** row.

- **Synced:** the host and every collaborator see one collection. Anyone can edit any board,
  add a board, remove a board, or rename / recolor the collection, and the change reaches
  everyone.
- **View-Only:** the recipient sees the collection and its boards update live, and can't edit.
- **Make a copy:** today's behaviour (frozen copy under `/shared_collections`).

## What exists today (dev-paul, 2026-10-22)

- `components/share/ShareCollectionLinkCreatorModal.tsx` only creates a copy link plus a
  "Share with a sub" button. `SharedCollectionImportMode` is `'copy' | 'substitute'`; its doc
  comment says Synced was left out because "live-mirroring N boards is unbounded cost".
- The copy share only includes boards directly in the collection
  (`BoardsModal.tsx`, `d.collectionId === collection.id`); sub-collections are dropped.
- Board Synced / View-Only: `/shared_boards/{shareId}` holds the board; each side's dashboard
  carries `linkedShareId` + `linkedShareRole` (`collaborator` | `viewer`). The live-share
  block in `context/DashboardContext.tsx` mirrors local edits (debounced) and subscribes to
  **every** linked dashboard at once, not just the active one. Host stop: viewers' boards are
  deleted, collaborators keep a detached copy flagged `linkedShareEnded`.
- Rules: `/shared_boards` already has host, collaborator (content only), self-join and
  self-leave update branches. Rules compiled size is ~240 KB of the ~249 KB cliff.

## Design

Reuse the board Synced machinery for the boards; add one small doc for the collection itself.

1. **`/linked_collections/{linkId}`** (new): `hostUid`, `hostName`, `mode`
   (`synced` | `view-only`), `name`, `color`, `icon`, `boards: [{ shareId, name, order }]`
   (cap 200), `participants: { uid: { role, name, joinedAt } }`, `updatedAt`, `updatedBy`.
2. **Sharing** writes one `/shared_boards` doc per board (same mode), then the link doc.
   The host's `Collection` gets `linkedCollectionId` + role `owner`.
3. **Importing** (`/share/collection/{linkId}`) makes a local `Collection` with
   `linkedCollectionId` + role, imports each board as a linked dashboard inside it, and joins
   the link doc and each board doc as participant.
4. **Membership sync:** a client subscribes to the link docs of its linked collections (one
   listener per shared collection). A new `boards[]` entry is imported locally; a removed entry
   detaches the local board (collaborator) or deletes it (viewer). Collection rename / color
   mirrors both ways for collaborators.
5. **Adding a board** to a Synced collection (create, move into, duplicate) shares it as a
   `/shared_boards` doc and appends to `boards[]`. Moving a board out removes it from
   `boards[]` for everyone (with a confirm).
6. **Cost fix (D3):** boards that belong to a linked collection subscribe to their
   `/shared_boards` doc only while active (plus a one-shot fetch on open). Mirror writes are
   already per-edit. This keeps a 20-board collection at ~2 listeners, not 20.
7. **Ending:** host "Stop sharing" ends the link doc and every board doc it lists; the
   existing ended-share paths then run. A collaborator can "Leave" (self-leave on all docs,
   keeps a detached copy).
8. **Flag:** `GlobalFeature` `collection-sync-sharing`, `defaultAccessLevel: 'admin'`,
   `stage: 'preview'`, `afterLaunch: 'retire'`. Without it the dialog stays as today.
   Copy stays available to everyone.
9. **Rules:** `/linked_collections` with host full update, collaborator update of `name`,
   `color`, `icon`, `boards`, `updatedAt`, `updatedBy` only, self-join / self-leave, view-only
   read for participants and any signed-in district user holding the link (matching
   `/shared_boards` get). Tests cover reads and writes. Measure with `check:rules-size`.
10. **Tour anchors:** carry over `share-collection.*`, add `share-collection.mode-synced`,
    `.mode-view-only`, `.mode-copy`, and Leave / Stop sharing menu items.

## Decisions for Paul

- **D1 Sub-collections.** Recommend: include them in Synced / View-Only shares (and fix Copy to
  include them too), rebuilt under the recipient's collection. Alternative: top-level boards only.
- **D2 Who can add or remove boards.** Recommend: any collaborator. Alternative: host only,
  collaborators edit board contents.
- **D3 Listener change** (step 6). Recommend: only for boards in a shared collection; single
  Synced boards keep today's behaviour.
- **D4 Removing a board.** Recommend: deleting or moving a board out of a Synced collection
  removes it for everyone after a confirm; others keep nothing. Alternative: others keep a
  detached copy.

## Wording (W1, needs Paul's OK)

Collection Share dialog, same rows as the board dialog:

- Synced: "You both edit the same collection."
- View-Only: "They see your changes live but can't edit."
- Make a copy: "They get their own copy to edit."
- Menu: "Stop sharing", "Leave shared collection"
- Confirm on remove: "Remove this board for everyone in the shared collection?"
- Toast when the host stops: "{{name}} stopped sharing this collection."

## Slices

1. Rules + types + link doc hook (`hooks/useLinkedCollection.ts`), rules tests.
2. Share dialog modes + host share flow + flag.
3. Import flow (`/share/collection/...`) and recipient collection.
4. Membership sync (add / remove / rename both ways) and active-only listeners (D3).
5. Stop sharing / Leave, ended states, tour anchors, e2e.
