/**
 * folderMenuAction — builds a "Move to folder…" kebab-menu entry.
 *
 * Keeps the action definition reusable across all four library managers
 * (Quiz, Video Activity, Guided Learning, MiniApp). The caller owns the
 * popover/dialog state — this helper only produces a `LibraryMenuAction`
 * whose `onClick` invokes the opener callback with the item id. The
 * manager is expected to render a `FolderPickerPopover` (or any chooser
 * UI) and call `useFolders().moveItem(id, folderId)` on commit.
 */

import { FolderInput } from 'lucide-react';
import type { LibraryMenuAction } from './types';

export interface MoveToFolderActionOptions {
  /** Invoked with the item id when the user picks "Move to folder…". */
  onOpenPicker: () => void;
  /**
   * When true, the action is disabled and tooltips with `disabledReason`.
   * Use this if the caller hasn't loaded folders yet or the user isn't
   * signed in.
   */
  disabled?: boolean;
  disabledReason?: string;
  /** Override the label (default: "Move to folder…"). */
  label?: string;
}

export const buildMoveToFolderAction = (
  options: MoveToFolderActionOptions
): LibraryMenuAction => ({
  id: 'move-to-folder',
  label: options.label ?? 'Move to folder…',
  icon: FolderInput,
  onClick: options.onOpenPicker,
  disabled: options.disabled,
  disabledReason: options.disabledReason,
});
