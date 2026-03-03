import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Play, Pencil, Trash2 } from 'lucide-react';
import { MiniAppItem } from '@/types';

interface SortableItemProps {
  app: MiniAppItem;
  onRun: (app: MiniAppItem) => void;
  onEdit: (app: MiniAppItem) => void;
  onDelete: (id: string) => void;
}

export const SortableItem: React.FC<SortableItemProps> = ({
  app,
  onRun,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        padding: 'min(12px, 2.5cqmin)',
        gap: 'min(12px, 2.5cqmin)',
      }}
      className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex items-center"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="text-slate-400 cursor-grab hover:text-slate-600 touch-none"
      >
        <GripVertical
          style={{
            width: 'min(16px, 4cqmin)',
            height: 'min(16px, 4cqmin)',
          }}
        />
      </div>

      {/* Icon & Title */}
      <div
        className="bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 border border-indigo-100"
        style={{
          width: 'min(40px, 10cqmin)',
          height: 'min(40px, 10cqmin)',
          fontSize: 'min(12px, 3cqmin)',
        }}
      >
        HTML
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className="text-slate-700 font-bold truncate"
          style={{ fontSize: 'min(14px, 3.5cqmin)' }}
        >
          {app.title}
        </h4>
        <div
          className="text-slate-500 font-mono"
          style={{ fontSize: 'min(10px, 2.5cqmin)' }}
        >
          {(app.html.length / 1024).toFixed(1)} KB
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center" style={{ gap: 'min(4px, 1cqmin)' }}>
        <button
          onClick={() => onRun(app)}
          className="bg-emerald-50/50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
          style={{ padding: 'min(8px, 2cqmin)' }}
          title="Run App"
          aria-label="Run App"
        >
          <Play
            className="fill-current"
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
        <div
          className="bg-slate-200"
          style={{
            width: '1px',
            height: 'min(24px, 6cqmin)',
            marginLeft: 'min(4px, 1cqmin)',
            marginRight: 'min(4px, 1cqmin)',
          }}
        ></div>
        <button
          onClick={() => onEdit(app)}
          className="text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
          style={{ padding: 'min(8px, 2cqmin)' }}
          title="Edit"
          aria-label="Edit"
        >
          <Pencil
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
        <button
          onClick={() => onDelete(app.id)}
          className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          style={{ padding: 'min(8px, 2cqmin)' }}
          title="Delete"
          aria-label="Delete"
        >
          <Trash2
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
      </div>
    </div>
  );
};
