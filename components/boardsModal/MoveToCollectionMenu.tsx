import { tourAttr } from '@/config/tourAnchors';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { Collection } from '@/types';
import { flattenCollections } from '@/components/layout/boardNavMenu';

interface MoveToCollectionMenuProps {
  collections: Collection[];
  /**
   * Collection id to omit from the destination list (or `null` to omit the
   * "Root" entry). Used to prevent the user from picking the source
   * Collection in single-board move flows — a same-location move would
   * issue a no-op Firestore write and toast a misleading "Moved" message.
   */
  excludeId?: string | null;
  onMove: (collectionId: string | null) => void;
  onClose: () => void;
}

export const MoveToCollectionMenu: React.FC<MoveToCollectionMenuProps> = ({
  collections,
  excludeId,
  onMove,
  onClose,
}) => {
  const { t } = useTranslation();
  // Tree-ordered list (orphans surfaced at root) with indentation by depth.
  const flat = useMemo(() => flattenCollections(collections), [collections]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="bare"
      zIndex="z-popover"
      maxWidth="max-w-sm"
      captureEscape
      ariaLabel={t('boardsModal.moveTitle', {
        defaultValue: 'Move to Collection',
      })}
      className="bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[60vh]!"
    >
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
          {t('boardsModal.moveTitle', { defaultValue: 'Move to Collection' })}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          {...tourAttr('boards-modal.move-close')}
          className="p-1 hover:bg-slate-100 rounded-sm"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <div className="overflow-y-auto custom-scrollbar p-2">
        {excludeId !== null && (
          <button
            onClick={() => {
              onMove(null);
              onClose();
            }}
            {...tourAttr('boards-modal.move-to-root')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span className="text-slate-700">
              {t('boardsModal.rootDestination', {
                defaultValue: 'Root (no Collection)',
              })}
            </span>
          </button>
        )}
        {flat
          .filter(({ c }) => c.id !== excludeId)
          .map(({ c, depth }) => (
            <button
              key={c.id}
              onClick={() => {
                onMove(c.id);
                onClose();
              }}
              {...tourAttr('boards-modal.move-target')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-slate-100 transition-colors"
              style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            >
              <Folder
                className="w-3.5 h-3.5 text-slate-500 shrink-0"
                style={c.color ? { color: c.color } : undefined}
              />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
      </div>
    </Modal>
  );
};
