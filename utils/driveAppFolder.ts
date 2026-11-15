import { APP_NAME } from '@/config/constants';
import { DRIVE_APP_FOLDER } from '@/config/devProject';

/** The parts of a Drive file's metadata the folder check reads. */
export interface DriveParentMeta {
  name?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
}

export type GetDriveParentMeta = (
  fileId: string
) => Promise<DriveParentMeta | null>;

const APP_FOLDER_NAMES = new Set([APP_NAME, DRIVE_APP_FOLDER, 'SPART Board']);
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** appProperties key set on every Guided Learning slide upload; only marked files are released. */
export const GL_SLIDE_APP_PROPERTY = 'spartboardGlSlide';
export const GL_SLIDE_APP_PROPERTIES = { [GL_SLIDE_APP_PROPERTY]: '1' };

/** True for a string shaped like a Drive file id, so it can't reach another API path. */
export const isDriveFileId = (id: string): boolean => DRIVE_ID.test(id);

/** True when Drive says the file sits directly in one of the app folders, e.g. "Assets/HotspotImages". */
export async function isInAppFolder(
  fileId: string,
  folderPaths: readonly string[],
  getMeta: GetDriveParentMeta,
  marker?: string
): Promise<boolean> {
  if (!isDriveFileId(fileId)) return false;
  const wanted = folderPaths.map((p) => p.split('/').filter(Boolean));
  try {
    const file = await getMeta(fileId);
    // A marked upload only: the folder is shared with Hotspot images an imported URL could name.
    if (marker && file?.appProperties?.[marker] !== '1') return false;
    for (const parentId of file?.parents ?? []) {
      // Walk up from the parent, matching folder names back to the app folder.
      const chain: string[] = [];
      let id: string | undefined = parentId;
      for (let depth = 0; id && depth < 4; depth++) {
        if (!isDriveFileId(id)) break;
        const folder = await getMeta(id);
        if (!folder?.name || folder.trashed) break;
        if (APP_FOLDER_NAMES.has(folder.name) && chain.length > 0) {
          const path = chain.reverse();
          if (
            wanted.some(
              (w) =>
                w.length === path.length &&
                w.every((part, i) => part === path[i])
            )
          )
            return true;
          break;
        }
        chain.push(folder.name);
        id = folder.parents?.[0];
      }
    }
  } catch {
    // An unknown location never counts as the app's own folder.
  }
  return false;
}
