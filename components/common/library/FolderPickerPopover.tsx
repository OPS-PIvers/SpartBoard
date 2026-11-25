/**
 * FolderPickerPopover — lightweight single-select folder picker.
 *
 * Used by:
 *   1. Row "Move to folder…" kebab action (see `folderMenuAction.ts`)
 *   2. `FolderSelectField` in editor modals
 *   3. Bulk-action bar's "Move to folder" button
 *
 * Renders a flat list of all folders (indented by depth to convey hierarchy)
 * plus a top "All items" entry that maps to `folderId = null` (root). Keeps
 * it dumb: fully controlled, no Firestore access. Callers pass the current
 * folders from `useFolders()` and handle the move/commit themselves.
 */

import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { WidgetAccentScope } from '@/components/common/WidgetAccentScope';
import { Folder as FolderIcon, Check, Inbox } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { Modal } from '@/components/common/Modal';
import type { LibraryFolder } from '@/types';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { isEscapeFromWidgetInput, scrollMovesAnchor } from '@/utils/domHelpers';
import { flattenTree } from '@/utils/folderTree';
import { folderColorSwatch } from './folderColors';

export interface FolderPickerPopoverProps {
  folders: LibraryFolder[];
  /** Currently-selected folder id (`null` = root / "All items"); undefined checks nothing. */
  selectedFolderId: string | null | undefined;
  onSelect: (folderId: string | null) => void;
  /** Called when the user dismisses the popover (click outside, Esc). */
  onClose: () => void;
  /** Header copy, e.g. "Move quiz to…". */
  title?: string;
  /**
   * Layout mode:
   *   - `'popover'` (default): portal-rendered card anchored via `anchorRef`
   *     to escape clipping ancestors (`overflow: hidden`, `will-change:
   *     transform`, etc.) inside widgets and modals.
   *   - `'dialog'`: fixed-position centered modal with a backdrop, suitable
   *     for use from a row action without a stable anchor.
   */
  variant?: 'popover' | 'dialog';
  /**
   * Anchor element for the `'popover'` variant. The popover is positioned
   * with `position: fixed` relative to this element's bounding rect.
   * Required for `'popover'`, ignored for `'dialog'`.
   */
  anchorRef?: RefObject<HTMLElement | null>;
  rootAnchor?: TourAnchorAttrs;
  rowAnchor?: (folderId: string) => TourAnchorAttrs;
  /** Label for the null choice; defaults to "All items (no folder)". */
  rootLabel?: string;
}

const POPOVER_WIDTH = 256;
const POPOVER_GAP = 4;

export const FolderPickerPopover: React.FC<FolderPickerPopoverProps> = ({
  folders,
  selectedFolderId,
  onSelect,
  onClose,
  title = 'Move to folder',
  variant = 'popover',
  anchorRef,
  rootAnchor,
  rowAnchor,
  rootLabel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerId = useId();
  const isPortaledPopover = variant === 'popover' && !!anchorRef;
  const [anchorPos, setAnchorPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!isPortaledPopover || !anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const viewportW =
      typeof window !== 'undefined' ? window.innerWidth : rect.right;
    const left = Math.max(
      8,
      Math.min(rect.left, viewportW - POPOVER_WIDTH - 8)
    );
    setAnchorPos({ top: rect.bottom + POPOVER_GAP, left });
  }, [isPortaledPopover, anchorRef]);

  useEffect(() => {
    if (variant === 'dialog') return undefined;
    const handlePointer = (event: MouseEvent | TouchEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (
        isPortaledPopover &&
        anchorRef?.current &&
        anchorRef.current.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (isEscapeFromWidgetInput(event)) return;
      // Capture phase + stopImmediatePropagation: wins over the host's own document or window Escape handler (Boards window close, widget minimize #2266).
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose, isPortaledPopover, anchorRef, variant]);

  useLayoutEffect(() => {
    if (!isPortaledPopover) return;
    const close = () => onClose();
    const closeOnScroll = (e: Event) => {
      if (scrollMovesAnchor(e, anchorRef?.current ?? null)) onClose();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [isPortaledPopover, onClose, anchorRef]);

  const flat = useMemo(
    () => flattenTree(folders, (f) => f.parentId),
    [folders]
  );

  const renderRow = (
    id: string | null,
    name: string,
    depth: number,
    icon: React.ReactNode
  ): React.ReactElement => {
    const selected = selectedFolderId === id;
    return (
      <button
        {...(id === null ? rootAnchor : rowAnchor?.(id))}
        key={id ?? 'root'}
        type="button"
        onClick={() => {
          onSelect(id);
          onClose();
        }}
        className={`flex w-full items-center gap-2 rounded-md text-left transition-colors ${
          selected
            ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{
          paddingInline: 'min(10px, 2.5cqmin)',
          paddingBlock: 'min(6px, 1.5cqmin)',
          paddingLeft: `calc(min(10px, 2.5cqmin) + ${depth * 14}px)`,
          fontSize: 'min(13px, 4cqmin)',
        }}
      >
        <span className="shrink-0 text-slate-400">{icon}</span>
        <span className="flex-1 truncate">{name}</span>
        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
      </button>
    );
  };

  const cardClass =
    variant === 'dialog'
      ? 'relative flex max-h-[80vh] w-full flex-col rounded-xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md'
      : isPortaledPopover
        ? 'flex max-h-72 flex-col rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md'
        : 'absolute z-50 mt-1 flex max-h-72 w-64 flex-col rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md';

  const cardStyle: React.CSSProperties | undefined =
    isPortaledPopover && anchorPos
      ? {
          position: 'fixed',
          top: anchorPos.top,
          left: anchorPos.left,
          width: POPOVER_WIDTH,
          zIndex: Z_INDEX.modalNestedContent,
        }
      : undefined;

  const card = (
    <div
      ref={containerRef}
      role={variant === 'dialog' ? undefined : 'dialog'}
      aria-labelledby={variant === 'dialog' ? undefined : headerId}
      data-click-outside-ignore={isPortaledPopover ? 'true' : undefined}
      className={cardClass}
      style={cardStyle}
    >
      <header
        id={headerId}
        className="border-b border-slate-200 font-semibold text-slate-500"
        style={{
          paddingInline: 'min(12px, 3cqmin)',
          paddingBlock: 'min(8px, 2cqmin)',
          fontSize: 'min(11px, 3.5cqmin)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </header>
      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingInline: 'min(6px, 1.5cqmin)',
          paddingBlock: 'min(6px, 1.5cqmin)',
        }}
      >
        {renderRow(
          null,
          rootLabel ?? 'All items (no folder)',
          0,
          <Inbox className="h-4 w-4" aria-hidden="true" />
        )}
        {flat.length === 0 ? (
          <p
            className="text-slate-400"
            style={{
              paddingInline: 'min(10px, 2.5cqmin)',
              paddingBlock: 'min(8px, 2cqmin)',
              fontSize: 'min(12px, 3.5cqmin)',
            }}
          >
            No folders yet. Create one from the sidebar.
          </p>
        ) : (
          flat.map(({ node, depth }) =>
            renderRow(
              node.id,
              node.name,
              depth,
              <FolderIcon
                className={`h-4 w-4 ${folderColorSwatch(node.color)?.icon ?? ''}`}
                aria-hidden="true"
              />
            )
          )
        )}
      </div>
    </div>
  );

  if (variant === 'dialog') {
    return (
      <Modal
        isOpen
        onClose={onClose}
        variant="bare"
        zIndex="z-dialog"
        maxWidth="max-w-xs"
        captureEscape
        ariaLabelledby={headerId}
      >
        {card}
      </Modal>
    );
  }

  if (isPortaledPopover) {
    if (!anchorPos || typeof document === 'undefined') return null;
    return createPortal(
      <WidgetAccentScope>{card}</WidgetAccentScope>,
      document.body
    );
  }

  return card;
};
