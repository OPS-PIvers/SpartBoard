import React, { useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, X } from 'lucide-react';
import type { Collection } from '@/types';

interface MoveToCollectionMenuProps {
  collections: Collection[];
  onMove: (collectionId: string | null) => void;
  onClose: () => void;
}

export const MoveToCollectionMenu: React.FC<MoveToCollectionMenuProps> = ({
  collections,
  onMove,
  onClose,
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Render flat list with indentation by depth.
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

  return (
    <div
      className="fixed inset-0 z-popover bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm max-h-[60vh] flex flex-col"
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            {t('boardsModal.moveTitle', { defaultValue: 'Move to Collection' })}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 hover:bg-slate-100 rounded"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar p-2">
          <button
            onClick={() => {
              onMove(null);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span className="text-slate-700">
              {t('boardsModal.rootDestination', {
                defaultValue: 'Root (no Collection)',
              })}
            </span>
          </button>
          {flat.map(({ c, depth }) => (
            <button
              key={c.id}
              onClick={() => {
                onMove(c.id);
                onClose();
              }}
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
      </div>
    </div>
  );
};
