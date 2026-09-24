// Writes to the member's own PLC Home v2 layout doc (users/{uid}/plc_layouts/{plcId}).

import { doc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type { PlcHomeTileInstance } from '@/components/plc/home/tiles/tileTypes';

function layoutRef(uid: string, plcId: string) {
  return doc(db, 'users', uid, 'plc_layouts', plcId);
}

/** Strips undefined options so Firestore never sees an undefined field. */
function cleanTiles(
  tiles: readonly PlcHomeTileInstance[]
): PlcHomeTileInstance[] {
  return tiles.map((t) =>
    t.options?.assessmentId
      ? {
          id: t.id,
          kind: t.kind,
          options: { assessmentId: t.options.assessmentId },
        }
      : { id: t.id, kind: t.kind }
  );
}

/** Saves the tile order and spotlight together (Customize, spotlight). */
export async function saveHomeLayout(
  uid: string,
  plcId: string,
  layout: { tiles: readonly PlcHomeTileInstance[]; heroTileId: string | null }
): Promise<void> {
  if (isAuthBypass) return;
  await setDoc(
    layoutRef(uid, plcId),
    {
      tiles: cleanTiles(layout.tiles),
      heroTileId: layout.heroTileId,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/** Replaces the seen result counts wholesale, which prunes deleted assessments (D27). */
export async function saveHomeSeenCounts(
  uid: string,
  plcId: string,
  seenCounts: Record<string, number>,
  firstWrite: { tiles: readonly PlcHomeTileInstance[] } | null
): Promise<void> {
  if (isAuthBypass) return;
  const updatedAt = Date.now();
  if (firstWrite) {
    await setDoc(
      layoutRef(uid, plcId),
      { tiles: cleanTiles(firstWrite.tiles), seenCounts, updatedAt },
      { merge: true }
    );
    return;
  }
  await setDoc(
    layoutRef(uid, plcId),
    { seenCounts, updatedAt },
    { mergeFields: ['seenCounts', 'updatedAt'] }
  );
}
