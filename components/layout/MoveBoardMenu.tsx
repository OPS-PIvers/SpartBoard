import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, Folder, Home, Plus } from 'lucide-react';
import type { Collection } from '@/types';
import { InlineNameInput } from './boardNavMenuParts';
import {
  MENU_PANEL_CLASS,
  flattenCollections,
  refocusIfLost,
} from './boardNavMenu';

interface MoveBoardMenuProps {
  boardName: string;
  currentCollectionId: string | null;
  collections: Collection[];
  onMove: (collectionId: string | null, collectionName: string) => void;
  onCreateCollection: (name: string) => void;
  onBack: () => void;
}

/** Boards-menu sub-view that files one board into a Collection (or out of one). */
export const MoveBoardMenu: FC<MoveBoardMenuProps> = ({
  boardName,
  currentCollectionId,
  collections,
  onMove,
  onCreateCollection,
  onBack,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const flat = useMemo(() => flattenCollections(collections), [collections]);
  const rootLabel = t('collectionSwitcher.root', {
    defaultValue: 'No Collection',
  });

  // Mount-time focus seed on the board's current Collection.
  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.focus();
  }, []);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const focused = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (idx: number) =>
      items[((idx % items.length) + items.length) % items.length].focus();
    switch (e.key) {
      case 'Escape':
      case 'ArrowLeft':
        e.preventDefault();
        e.stopPropagation();
        onBack();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusAt(focused < 0 ? 0 : focused + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(focused < 0 ? items.length - 1 : focused - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(items.length - 1);
        break;
    }
  };

  const itemClass = (isCurrent: boolean) =>
    `w-full flex items-center gap-2 pr-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
      isCurrent ? 'text-white' : 'text-white/80 hover:bg-white/10'
    }`;

  const moveTitle = t('boardsModal.moveTitle', {
    defaultValue: 'Move to Collection',
  });

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${moveTitle}: ${boardName}`}
      onKeyDown={handleKeyDown}
      className={MENU_PANEL_CLASS}
    >
      <div className="flex items-center gap-1.5 pl-1.5 pr-3 py-0.5">
        <button
          type="button"
          role="menuitem"
          onClick={onBack}
          aria-label={t('common.back', { defaultValue: 'Back' })}
          title={t('common.back', { defaultValue: 'Back' })}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <div className="text-xxs font-bold uppercase tracking-wider text-white/40">
            {moveTitle}
          </div>
          <div className="truncate text-sm font-semibold text-white">
            {boardName}
          </div>
        </div>
      </div>
      <div className="my-1 border-t border-white/10" />

      <button
        type="button"
        role="menuitemradio"
        aria-checked={currentCollectionId === null}
        onClick={() => onMove(null, rootLabel)}
        style={{ paddingLeft: '0.75rem' }}
        className={itemClass(currentCollectionId === null)}
      >
        <Home className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{rootLabel}</span>
        {currentCollectionId === null && (
          <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        )}
      </button>
      {flat.map(({ c, depth }) => {
        const isCurrent = currentCollectionId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="menuitemradio"
            aria-checked={isCurrent}
            onClick={() => onMove(c.id, c.name)}
            style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            className={itemClass(isCurrent)}
          >
            <Folder
              className="w-3.5 h-3.5 flex-shrink-0"
              style={c.color ? { color: c.color } : undefined}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{c.name}</span>
            {isCurrent && (
              <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            )}
          </button>
        );
      })}

      <div className="my-1 border-t border-white/10" />
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
            onCreateCollection(name);
          }}
          onCancel={() => {
            setIsCreating(false);
            refocusIfLost(menuRef.current, '[data-new-collection]');
          }}
        />
      ) : (
        <button
          type="button"
          role="menuitem"
          data-new-collection
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
        >
          <Plus className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {t('boardsModal.newCollection', { defaultValue: 'New Collection' })}
        </button>
      )}
    </div>
  );
};
