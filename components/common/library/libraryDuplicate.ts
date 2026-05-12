/**
 * `buildDuplicateAction` — shared helper for the Duplicate kebab entry that
 * the four library managers (Quiz / Video Activity / MiniApp / Guided
 * Learning) all surface in their card overflow menus.
 *
 * Centralises the label / icon / id-namespacing so each manager's overflow
 * menu reads the same and so a future label change (translation, copy
 * tweak) lands in one place.
 *
 * Usage in a manager:
 *
 * ```tsx
 * const overflow: LibraryMenuAction[] = [
 *   buildDuplicateAction(quiz, async () => {
 *     await duplicateQuiz(quiz.id);
 *   }),
 *   { id: 'edit', label: 'Edit', onClick: () => openEditor(quiz.id) },
 *   { id: 'delete', label: 'Delete', destructive: true, onClick: ... },
 * ];
 * ```
 */

import { Copy } from 'lucide-react';
import type { LibraryMenuAction } from './types';

interface DuplicableItem {
  id: string;
  title?: string;
}

interface BuildDuplicateActionOptions {
  /** Override the default "Duplicate" label (e.g. for i18n). */
  label?: string;
  /** Disable when a duplication is already in flight. */
  disabled?: boolean;
  /** Tooltip when disabled. */
  disabledReason?: string;
}

export function buildDuplicateAction(
  item: DuplicableItem,
  onDuplicate: () => void | Promise<void>,
  options: BuildDuplicateActionOptions = {}
): LibraryMenuAction {
  return {
    id: `duplicate-${item.id}`,
    label: options.label ?? 'Duplicate',
    icon: Copy,
    onClick: () => {
      void onDuplicate();
    },
    disabled: options.disabled,
    disabledReason: options.disabledReason,
  };
}

/**
 * Suggest a "(Copy)" suffix for a duplicated item title. Idempotent — if
 * the title already ends in " (Copy)" or " (Copy N)" it bumps the counter
 * instead of stacking suffixes.
 *
 * Edge cases:
 *   - Empty / whitespace-only titles → "Copy" (no leading space).
 *   - Nested chains like "Foo (Copy) (Copy)" bump the LAST `(Copy)` to
 *     "(Copy 2)" — the regex anchors to the trailing suffix only, so
 *     intermediate `(Copy)` groups are treated as part of the base name.
 *     This is intentional: bumping the most-recent duplicate produces a
 *     more obvious filename than walking back to the original.
 */
export function suggestDuplicateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') return 'Copy';
  const match = trimmed.match(/^(.*?) \(Copy(?: (\d+))?\)$/);
  if (!match) {
    return `${trimmed} (Copy)`;
  }
  const base = match[1] ?? trimmed;
  const counter = match[2] ? parseInt(match[2], 10) : 1;
  return `${base} (Copy ${counter + 1})`;
}
