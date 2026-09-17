import { type FC, Fragment, useMemo, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Home, Pencil, Plus } from 'lucide-react';
import type { Collection } from '@/types';
import {
  InlineNameInput,
  RowActionButton,
  RowDragHandle,
} from './boardNavMenuParts';
import {
  SortableList,
  type SortableListDragHandleProps,
} from '@/components/common/SortableList';
import { shiftId } from '@/utils/reorderIds';
import {
  MENU_HEADER_CLASS,
  MENU_PANEL_CLASS,
  ROW_ACTIONS_CLASS,
  flattenCollections,
  moveFocusWithinRow,
  refocusIfLost,
} from './boardNavMenu';

interface CollectionSwitcherMenuProps {
  collections: Collection[];
  activeCollectionId: string | null;
  onSelect: (collectionId: string | null) => void;
  onClose: () => void;
  /** Enables the inline rename action on each Collection row. */
  onRename?: (collectionId: string, name: string) => void;
  /** Enables the "New Collection" row at the bottom of the menu. */
  onCreate?: (name: string) => void;
  /** Enables drag (and Alt+Arrow) reordering among sibling Collections. */
  onReorder?: (parentId: string | null, orderedIds: string[]) => void;
}

const getCollectionId = (c: Collection) => c.id;

/**
 * Submenu opened from BoardNavFab. Lists all Collections (flat with
 * depth-indent) plus the "Root (no Collection)" entry. Used to jump the
 * navigation surface to a different Collection — the actual Board switch
 * is handled by the caller, which routes through
 * DashboardContext.setActiveCollectionId.
 */
export const CollectionSwitcherMenu: FC<CollectionSwitcherMenuProps> = ({
  collections,
  activeCollectionId,
  onSelect,
  onClose,
  onRename,
  onCreate,
  onReorder,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // itemRefs[0] = root button, itemRefs[1..n] = Collection buttons in flat
  // order, itemRefs[n + 1] = "New Collection" (when onCreate is provided).
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const flat = useMemo(() => flattenCollections(collections), [collections]);
  const flatIndexById = useMemo(
    () => new Map(flat.map(({ c }, index) => [c.id, index])),
    [flat]
  );
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, Collection[]>();
    for (const { c, effectiveParentId } of flat) {
      m.set(effectiveParentId, [...(m.get(effectiveParentId) ?? []), c]);
    }
    return m;
  }, [flat]);

  // Auto-focus the active collection item exactly once when the submenu mounts.
  // Empty deps array is intentional: this is mount-time focus seeding, not a
  // reaction to prop changes. Adding activeCollectionId or flat as deps would
  // re-steal focus every time the parent re-renders (e.g. Firestore snapshot),
  // yanking the keyboard user away from wherever they navigated mid-session.
  // Focus restoration when the menu CLOSES is handled by the onClose callback
  // in BoardNavFab (via requestAnimationFrame(() => triggerRef.current?.focus())).
  useEffect(() => {
    const activeIdx =
      activeCollectionId === null
        ? 0
        : 1 + flat.findIndex(({ c }) => c.id === activeCollectionId);
    itemRefs.current[activeIdx >= 0 ? activeIdx : 0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use the known item count as the upper bound. `itemRefs.current` is
  // index-keyed and not pruned when Collections change, so its `.length` can
  // overshoot the last live entry.
  const lastIdx = flat.length + (onCreate ? 1 : 0);

  const focusItem = (idx: number) => {
    const total = lastIdx + 1;
    const wrapped = ((idx % total) + total) % total;
    itemRefs.current[wrapped]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const active = document.activeElement;
    const focused = itemRefs.current.findIndex(
      (el, i) =>
        i <= lastIdx &&
        !!el &&
        (el === active ||
          (!!active && !!el.closest('[data-menu-row]')?.contains(active)))
    );
    if (
      onReorder &&
      e.altKey &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    ) {
      const id = active
        ?.closest<HTMLElement>('[data-collection-id]')
        ?.getAttribute('data-collection-id');
      const entry = flat.find(({ c }) => c.id === id);
      if (!entry) return;
      e.preventDefault();
      const next = shiftId(
        (childrenByParent.get(entry.effectiveParentId) ?? []).map(
          getCollectionId
        ),
        entry.c.id,
        e.key === 'ArrowUp' ? -1 : 1
      );
      if (next) onReorder(entry.effectiveParentId, next);
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        // Stop the bubble to DashboardView's global Escape handler, which would otherwise minimize an unrelated widget.
        e.stopPropagation();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusItem(focused < 0 ? 0 : focused + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(focused < 0 ? lastIdx : focused - 1);
        break;
      case 'ArrowRight':
        moveFocusWithinRow(e, 1);
        break;
      case 'ArrowLeft':
        moveFocusWithinRow(e, -1);
        break;
      case 'F2': {
        const id = active
          ?.closest<HTMLElement>('[data-collection-id]')
          ?.getAttribute('data-collection-id');
        if (id && onRename) {
          e.preventDefault();
          setEditingId(id);
        }
        break;
      }
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(lastIdx);
        break;
      case 'Tab':
        // Tab takes focus out — close to keep state consistent (matches BoardNavFab pattern).
        onClose();
        break;
    }
  };

  const itemClass = (isActive: boolean) =>
    `w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
      isActive
        ? 'bg-brand-blue-primary text-white'
        : 'text-white/80 hover:bg-white/10'
    }`;

  const renderRow = (
    c: Collection,
    depth: number,
    dragHandle?: SortableListDragHandleProps
  ): ReactNode => {
    const isActive = activeCollectionId === c.id;
    if (editingId === c.id && onRename) {
      return (
        <InlineNameInput
          key={c.id}
          initialValue={c.name}
          placeholder={t('boardsModal.newCollectionPrompt', {
            defaultValue: 'Collection name',
          })}
          ariaLabel={t('collectionSwitcher.renameCollection', {
            defaultValue: 'Rename collection',
          })}
          commitOnBlur
          onCommit={(name) => {
            setEditingId(null);
            onRename(c.id, name);
            refocusIfLost(
              menuRef.current,
              `[data-collection-id="${c.id}"] [role="menuitem"]`
            );
          }}
          onCancel={() => {
            setEditingId(null);
            refocusIfLost(
              menuRef.current,
              `[data-collection-id="${c.id}"] [role="menuitem"]`
            );
          }}
        />
      );
    }
    return (
      <div
        key={c.id}
        data-menu-row
        data-collection-id={c.id}
        className={`group flex items-center transition-colors ${
          isActive
            ? 'bg-brand-blue-primary text-white'
            : 'text-white/80 hover:bg-white/10'
        }`}
      >
        <button
          ref={(el) => {
            itemRefs.current[(flatIndexById.get(c.id) ?? 0) + 1] = el;
          }}
          role="menuitem"
          onClick={() => {
            onSelect(c.id);
            onClose();
          }}
          style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
          className={`min-w-0 flex-1 flex items-center gap-2 pr-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
            isActive ? 'bg-brand-blue-primary text-white' : 'text-white/80'
          }`}
        >
          <Folder
            className="w-3.5 h-3.5 flex-shrink-0"
            style={c.color ? { color: c.color } : undefined}
          />
          <span className="truncate">{c.name}</span>
        </button>
        {(onRename ?? dragHandle) && (
          <div className={ROW_ACTIONS_CLASS}>
            {onRename && (
              <RowActionButton
                icon={Pencil}
                label={t('collectionSwitcher.renameCollection', {
                  defaultValue: 'Rename collection',
                })}
                onClick={() => setEditingId(c.id)}
              />
            )}
            {dragHandle && (
              <RowDragHandle
                label={t('boardNav.dragToReorder', {
                  defaultValue: 'Drag to reorder (Alt+Arrow keys)',
                })}
                handle={dragHandle}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  // Each sibling group sorts on its own, and a row drags its whole subtree with it.
  const renderGroup = (parentId: string | null, depth: number): ReactNode => {
    const siblings = childrenByParent.get(parentId) ?? [];
    if (!onReorder || siblings.length < 2) {
      return siblings.map((c) => (
        <Fragment key={c.id}>
          {renderRow(c, depth)}
          {renderGroup(c.id, depth + 1)}
        </Fragment>
      ));
    }
    return (
      <SortableList
        items={siblings}
        getId={getCollectionId}
        onReorder={(next) => onReorder(parentId, next.map(getCollectionId))}
        renderItem={(c, handle) => (
          <>
            {renderRow(c, depth, handle)}
            {renderGroup(c.id, depth + 1)}
          </>
        )}
      />
    );
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleKeyDown}
      aria-label={t('collectionSwitcher.title', {
        defaultValue: 'Switch Collection',
      })}
      className={MENU_PANEL_CLASS}
    >
      <div className={MENU_HEADER_CLASS}>
        {t('collectionSwitcher.title', { defaultValue: 'Switch Collection' })}
      </div>
      <button
        ref={(el) => {
          itemRefs.current[0] = el;
        }}
        role="menuitem"
        onClick={() => {
          onSelect(null);
          onClose();
        }}
        className={itemClass(activeCollectionId === null)}
      >
        <Home className="w-3.5 h-3.5 flex-shrink-0" />
        {t('collectionSwitcher.root', { defaultValue: 'No Collection' })}
      </button>
      {renderGroup(null, 0)}
      {onCreate && (
        <div className="mt-1 border-t border-white/10 pt-1">
          {isCreating ? (
            <InlineNameInput
              placeholder={t('boardsModal.newCollectionPrompt', {
                defaultValue: 'Collection name',
              })}
              ariaLabel={t('boardsModal.newCollection', {
                defaultValue: 'New Collection',
              })}
              commitOnBlur={false}
              onCommit={(name) => {
                setIsCreating(false);
                onCreate(name);
                refocusIfLost(menuRef.current, '[data-new-collection]');
              }}
              onCancel={() => {
                setIsCreating(false);
                refocusIfLost(menuRef.current, '[data-new-collection]');
              }}
            />
          ) : (
            <button
              ref={(el) => {
                itemRefs.current[flat.length + 1] = el;
              }}
              role="menuitem"
              data-new-collection
              onClick={() => setIsCreating(true)}
              className={itemClass(false)}
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              {t('boardsModal.newCollection', {
                defaultValue: 'New Collection',
              })}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
