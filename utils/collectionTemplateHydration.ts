import type {
  CollectionTemplate,
  Dashboard,
  BoardTemplateSnapshot,
} from '@/types';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

export interface HydrateOptions {
  /** Highest existing `order` value across the recipient's dashboards. New Boards land at `existingMaxOrder + 1..N`. */
  existingMaxOrder: number;
}

export interface HydrationResult {
  /**
   * Args for `useCollections.createCollection`. `parentCollectionId` is
   * always null — templates land at the recipient's root; they can move
   * the resulting Collection after import.
   */
  collectionInput: {
    name: string;
    color?: string;
    icon?: string;
    parentCollectionId: null;
  };
  /**
   * Pre-built Dashboard payloads to pass to `createNewDashboard`.
   * Caller is responsible for stamping `collectionId` once the new
   * Collection id is known (Firestore round-trip).
   */
  boardInputs: Dashboard[];
  /**
   * If the template named a default Board snapshot, this is the freshly
   * assigned uuid of that Board in `boardInputs`. Caller passes it to
   * `useCollections.setCollectionDefaultBoard` after the Collection
   * exists. Null when the template named no default, or named one that
   * isn't present in boardSnapshots.
   */
  defaultBoardId: string | null;
}

/**
 * Pure data-shaping for a Collection template. No I/O — caller is
 * responsible for the Firestore writes via the standard
 * useCollections + DashboardContext actions. Each Board snapshot is
 * given a fresh uuid; if the snapshot named a default Board, the new
 * id of that Board is surfaced on the result so the caller can stamp
 * it after the Collection write resolves.
 *
 * Why no I/O: the existing primitives in useCollections and
 * DashboardContext already handle Firestore + permission gating + toast
 * surfacing. Reusing them keeps the import flow consistent with
 * everything else the user does (creating Collections / Boards
 * manually, importing shared Collections in Plan 3, etc.).
 */
export const hydrateCollectionTemplate = (
  template: CollectionTemplate,
  options: HydrateOptions
): HydrationResult => {
  // Map snapshot id → new uuid so we can resolve the default-board hint.
  const idRemap = new Map<string, string>();

  const boardInputs: Dashboard[] = template.boardSnapshots.map(
    (snap: BoardTemplateSnapshot, idx: number) => {
      const newId = crypto.randomUUID();
      idRemap.set(snap.id, newId);

      const board = {
        id: newId,
        name: snap.name,
        background: snap.background,
        widgets: snap.widgets,
        createdAt: Date.now(),
        order: options.existingMaxOrder + idx + 1,
        ...(snap.globalStyle !== undefined && {
          globalStyle: { ...DEFAULT_GLOBAL_STYLE, ...snap.globalStyle },
        }),
        ...(snap.settings !== undefined && { settings: snap.settings }),
        ...(snap.libraryOrder !== undefined && {
          libraryOrder: snap.libraryOrder,
        }),
        ...(snap.viewportWidth !== undefined && {
          viewportWidth: snap.viewportWidth,
        }),
        ...(snap.viewportHeight !== undefined && {
          viewportHeight: snap.viewportHeight,
        }),
      } as Dashboard;

      return board;
    }
  );

  const defaultHint = template.collectionSnapshot.defaultBoardSnapshotId;
  const defaultBoardId =
    defaultHint !== undefined && idRemap.has(defaultHint)
      ? (idRemap.get(defaultHint) ?? null)
      : null;

  const collectionInput: HydrationResult['collectionInput'] = {
    name: template.collectionSnapshot.name,
    parentCollectionId: null,
    ...(template.collectionSnapshot.color !== undefined && {
      color: template.collectionSnapshot.color,
    }),
    ...(template.collectionSnapshot.icon !== undefined && {
      icon: template.collectionSnapshot.icon,
    }),
  };

  return { collectionInput, boardInputs, defaultBoardId };
};
