import React from 'react';
import { FileText, Trash2, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PdfItem } from '@/types';

interface SortableRowProps {
  pdf: PdfItem;
  onOpen: (pdf: PdfItem) => void;
  onDelete: (id: string, storagePath: string) => void;
}

export const SortableRow: React.FC<SortableRowProps> = React.memo(
  ({ pdf, onOpen, onDelete }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: pdf.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const sizeKb = (pdf.size / 1024).toFixed(0);

    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          padding: 'min(10px, 2.5cqmin)',
          gap: 'min(10px, 2.5cqmin)',
        }}
        className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-red-200 transition-all flex items-center"
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="text-slate-400 cursor-grab hover:text-slate-600 touch-none shrink-0"
        >
          <GripVertical
            style={{ width: 'min(16px, 4cqmin)', height: 'min(16px, 4cqmin)' }}
          />
        </div>

        {/* Icon */}
        <div
          className="bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0 border border-red-100"
          style={{ width: 'min(38px, 9cqmin)', height: 'min(38px, 9cqmin)' }}
        >
          <FileText
            style={{
              width: 'min(18px, 4.5cqmin)',
              height: 'min(18px, 4.5cqmin)',
            }}
          />
        </div>

        {/* Name + size */}
        <div className="flex-1 min-w-0">
          <h4
            className="text-slate-700 font-bold truncate"
            style={{ fontSize: 'min(13px, 3.5cqmin)' }}
          >
            {pdf.name}
          </h4>
          <div
            className="text-slate-400 font-mono"
            style={{ fontSize: 'min(10px, 2.5cqmin)' }}
          >
            {Number(sizeKb) >= 1024
              ? `${(Number(sizeKb) / 1024).toFixed(1)} MB`
              : `${sizeKb} KB`}
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(4px, 1cqmin)' }}
        >
          <button
            onClick={() => onOpen(pdf)}
            className="bg-red-600 hover:bg-red-700 text-white rounded-lg font-black uppercase tracking-wider transition-colors"
            style={{
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'min(10px, 2.5cqmin)',
            }}
            title="Open PDF"
          >
            Open
          </button>
          <button
            onClick={() => onDelete(pdf.id, pdf.storagePath)}
            className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            style={{ padding: 'min(6px, 1.5cqmin)' }}
            title="Delete PDF"
          >
            <Trash2
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          </button>
        </div>
      </div>
    );
  }
);

SortableRow.displayName = 'SortableRow';
