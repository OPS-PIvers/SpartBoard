import type { Dashboard } from '@/types';

/**
 * Strip host-specific fields from a Dashboard before snapshotting into
 * any recipient-facing artifact (Collection share, Collection template,
 * Board template). The recipient is starting fresh — they must not
 * inherit anything that names the host, points at the host's Storage /
 * Drive, or replays the host's live-session state.
 *
 * Stripped:
 * - `linkedShareId` / `linkedShareRole` / `linkedShareHostName` /
 *   `linkedShareEnded`: live single-Board share linkage. Inheriting these
 *   would falsely mark the recipient as a collaborator on the host's
 *   original share.
 * - `driveFileId`: points at the HOST's Drive file. A recipient writing
 *   updates through this id would push to the host's Drive.
 * - `thumbnailUrl`: signed URL into the host's Storage bucket. Expires
 *   and isn't reachable under the recipient's auth — let it regenerate
 *   on first save.
 * - `sharedGroups`: per-host share permissions; not transferable.
 * - `annotationOverlay`: live pencil-overlay strokes from the host's
 *   session. Transient state — never persisted state.
 * - `isDefault`: host's "open this on sign-in" flag. Snapshots must not
 *   silently change which Board the recipient lands on.
 * - `isPinned`: host's pin in the FAB popover. Snapshots should not
 *   surprise the recipient with new pinned Boards.
 * - `updatedAt`: timestamp from the host's last edit. Recipient's copy
 *   should stamp this on first own edit, not lie about provenance.
 * - `collectionId`: host's local Collection id. Consumers reassign at
 *   instantiation time — keeping it would be stale data.
 *
 * Preserved:
 * - `viewportWidth` / `viewportHeight` — layout hints for proportional
 *   widget scaling on load. Recipient benefits from seeing the original
 *   composition's intended viewport.
 * - `globalStyle`, `settings`, `libraryOrder`, `widgets`, `background`,
 *   `name`, `id`, `createdAt`, `order` — the Board's design itself.
 */
export const sanitizeBoardSnapshot = (board: Dashboard): Dashboard => {
  const {
    linkedShareId: _linkedShareId,
    linkedShareRole: _linkedShareRole,
    linkedShareHostName: _linkedShareHostName,
    linkedShareEnded: _linkedShareEnded,
    driveFileId: _driveFileId,
    thumbnailUrl: _thumbnailUrl,
    sharedGroups: _sharedGroups,
    annotationOverlay: _annotationOverlay,
    isDefault: _isDefault,
    isPinned: _isPinned,
    updatedAt: _updatedAt,
    collectionId: _collectionId,
    ...rest
  } = board;
  return rest;
};
