/** Live views of the student right-click and Grammarly switches in `admin_settings`. */

import {
  createAdminSwitchStore,
  type AdminSwitchState,
} from '@/hooks/createAdminSwitchStore';
import {
  STUDENT_CONTEXT_MENU_SETTINGS_DOC,
  STUDENT_GRAMMARLY_SETTINGS_DOC,
  normalizeStudentContextMenuSettings,
  normalizeStudentGrammarlySettings,
} from '@/config/studentContextMenu';

export type StudentContextMenuBlockState = AdminSwitchState;

const contextMenuStore = createAdminSwitchStore(
  STUDENT_CONTEXT_MENU_SETTINGS_DOC,
  (raw) => normalizeStudentContextMenuSettings(raw).enabled
);
const grammarlyStore = createAdminSwitchStore(
  STUDENT_GRAMMARLY_SETTINGS_DOC,
  (raw) => normalizeStudentGrammarlySettings(raw).enabled
);

/** True once the root student guard has started the listener on this page. */
export const isStudentContextMenuBlockWatched = contextMenuStore.isWatched;

/** Starts the listener; mounted once by the root student guard. */
export const useStudentContextMenuBlock = contextMenuStore.useWatched;

/** Reads the guard's listener without starting one, so pages outside the guard stay off. */
export const useObservedStudentContextMenuBlock = contextMenuStore.useObserved;

/** Starts the Grammarly switch listener; mounted once by the root student guard. */
export const useStudentGrammarlyBlock = grammarlyStore.useWatched;
