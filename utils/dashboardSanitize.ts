import type { Dashboard } from '@/types';
import { scrubDashboardPII } from '@/utils/dashboardPII';

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
 * - `annotationOverlay`: the host's pencil markup. It DOES persist with the
 *   host's own Board, but it is the host's annotation of their lesson — a
 *   duplicate, template, or Collection share starts from the design, not
 *   from someone else's marked-up copy. Locked in dashboardSanitize.test.ts.
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

/**
 * `sanitizeBoardSnapshot` plus the widget-config PII scrub, for snapshots
 * that leave the host's account (Collection shares, Board and Collection
 * templates). `sanitizeBoardSnapshot` only touches Board-level fields, so on
 * its own it let custom-list student names reach `/shared_collections`.
 * Host-owned copies (duplicate Board / duplicate Collection) keep their names
 * and must not use this.
 */
export const sanitizeBoardForRecipient = (board: Dashboard): Dashboard =>
  scrubDashboardPII(sanitizeBoardSnapshot(board));

/**
 * Snapshot for a substitute share. Same scrub as `sanitizeBoardForRecipient`,
 * but keeps the host's pen annotations and share groups: a sub is looking at
 * the teacher's own board for the day, not starting from its design
 * (docs/plans/shipped/SUB_SHARE_COLLECTIONS.md D4).
 */
export const sanitizeBoardForSubShare = (board: Dashboard): Dashboard => {
  const cleaned = sanitizeBoardForRecipient(board);
  return {
    ...cleaned,
    ...(board.annotationOverlay !== undefined && {
      annotationOverlay: board.annotationOverlay,
    }),
    ...(board.sharedGroups !== undefined && {
      sharedGroups: board.sharedGroups,
    }),
  };
};
