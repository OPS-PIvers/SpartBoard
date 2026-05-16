import { type FC, useMemo, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Home } from 'lucide-react';
import type { Collection } from '@/types';

interface CollectionSwitcherMenuProps {
  collections: Collection[];
  activeCollectionId: string | null;
  onSelect: (collectionId: string | null) => void;
  onClose: () => void;
}

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
}) => {
  const { t } = useTranslation();

  // itemRefs[0] = root button, itemRefs[1..n] = Collection buttons in flat order.
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const flat = useMemo(() => {
    const childrenByParent = new Map<string | null, Collection[]>();
    for (const c of collections) {
      const bucket = childrenByParent.get(c.parentCollectionId) ?? [];
      bucket.push(c);
      childrenByParent.set(c.parentCollectionId, bucket);
    }
    for (const bucket of childrenByParent.values()) {
      bucket.sort((a, b) => a.order - b.order);
    }
    const out: { c: Collection; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      const kids = childrenByParent.get(parent) ?? [];
      for (const k of kids) {
        out.push({ c: k, depth });
        walk(k.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [collections]);

  // Auto-focus the active item once on open. We capture the target index from
  // the initial props (activeCollectionId / flat are stable at mount) and focus
  // after the first paint so the button refs are populated.
  useEffect(() => {
    const activeIdx =
      activeCollectionId === null
        ? 0
        : 1 + flat.findIndex(({ c }) => c.id === activeCollectionId);
    itemRefs.current[activeIdx >= 0 ? activeIdx : 0]?.focus();
    // activeCollectionId and flat are intentionally excluded: this effect runs
    // once on mount to set initial focus; re-focusing on every prop change
    // would steal focus from the user mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusItem = (idx: number) => {
    const total = 1 + flat.length;
    if (total === 0) return;
    const wrapped = ((idx % total) + total) % total;
    itemRefs.current[wrapped]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const focused = itemRefs.current.findIndex(
      (el) => el === document.activeElement
    );
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusItem(focused < 0 ? 0 : focused + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(focused < 0 ? itemRefs.current.length - 1 : focused - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(itemRefs.current.length - 1);
        break;
      case 'Tab':
        // Tab takes focus out — close to keep state consistent (matches BoardNavFab pattern).
        onClose();
        break;
    }
  };

  return (
    <div
      role="menu"
      onKeyDown={handleKeyDown}
      aria-label={t('collectionSwitcher.title', {
        defaultValue: 'Switch Collection',
      })}
      className="absolute bottom-full left-0 mb-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40">
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
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
          activeCollectionId === null
            ? 'bg-brand-blue-primary text-white'
            : 'text-white/80 hover:bg-white/10'
        }`}
      >
        <Home className="w-3.5 h-3.5 flex-shrink-0" />
        {t('collectionSwitcher.root', { defaultValue: 'All Boards (root)' })}
      </button>
      {flat.map(({ c, depth }, index) => {
        const isActive = activeCollectionId === c.id;
        return (
          <button
            key={c.id}
            ref={(el) => {
              itemRefs.current[index + 1] = el;
            }}
            role="menuitem"
            onClick={() => {
              onSelect(c.id);
              onClose();
            }}
            style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            className={`w-full flex items-center gap-2 pr-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
              isActive
                ? 'bg-brand-blue-primary text-white'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            <Folder
              className="w-3.5 h-3.5 flex-shrink-0"
              style={c.color ? { color: c.color } : undefined}
            />
            <span className="truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
};
