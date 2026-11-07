import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { FlashcardCard } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { SpeakCardRow } from './speak/SpeakCardStatus';
import { ipaDraftFor } from './speak/speakEditorState';
import type { SpeakRowProps } from './useFlashcardEditorState';

interface SortableCardRowProps {
  card: FlashcardCard;
  index: number;
  onChange: (id: string, updates: Partial<FlashcardCard>) => void;
  onRemove: (id: string) => void;
  onAddAfter: (index: number) => void;
  speak: SpeakRowProps | null;
}

export const SortableCardRow: React.FC<SortableCardRowProps> = ({
  card,
  index,
  onChange,
  onRemove,
  onAddAfter,
  speak,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      className={`grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.25fr)_auto] items-start rounded-2xl border bg-white shadow-xs ${
        isDragging ? 'z-10 border-rose-300 opacity-70' : 'border-slate-200'
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        gap: 'min(8px, 2cqmin)',
        padding: 'min(10px, 2.5cqmin)',
      }}
    >
      <button
        type="button"
        className="cursor-grab rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
        style={{ padding: 'min(6px, 1.5cqmin)' }}
        aria-label={`Move card ${index + 1}`}
        {...tourFieldAttr(
          'flashcards.card-move',
          'flashcards',
          `row-${index + 1}`
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical
          style={{
            width: 'min(17px, 4.5cqmin)',
            height: 'min(17px, 4.5cqmin)',
          }}
        />
      </button>
      <span
        className="min-w-[3ch] pt-2 text-right font-black tabular-nums text-slate-300"
        style={{ fontSize: 'min(12px, 3.8cqmin)' }}
      >
        {index + 1}
      </span>
      <label className="min-w-0">
        <span className="sr-only">Term {index + 1}</span>
        <textarea
          value={card.term}
          onChange={(event) => onChange(card.id, { term: event.target.value })}
          maxLength={500}
          rows={2}
          className="w-full resize-none rounded-xl border border-slate-200 text-slate-800 outline-hidden focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
          style={{
            padding: 'min(8px, 2cqmin)',
            fontSize: 'min(13px, 4cqmin)',
          }}
          placeholder="Term"
          {...tourFieldAttr(
            'flashcards.card-term',
            'flashcards',
            `row-${index + 1}`
          )}
        />
      </label>
      <label className="min-w-0">
        <span className="sr-only">Definition {index + 1}</span>
        <textarea
          value={card.definition}
          onChange={(event) =>
            onChange(card.id, { definition: event.target.value })
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onAddAfter(index);
            }
          }}
          maxLength={1000}
          rows={2}
          className="w-full resize-none rounded-xl border border-slate-200 text-slate-800 outline-hidden focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
          style={{
            padding: 'min(8px, 2cqmin)',
            fontSize: 'min(13px, 4cqmin)',
          }}
          placeholder="Definition"
          {...tourFieldAttr(
            'flashcards.card-definition',
            'flashcards',
            `row-${index + 1}`
          )}
        />
      </label>
      <button
        type="button"
        onClick={() => onRemove(card.id)}
        className="rounded-lg text-rose-600/70 hover:bg-rose-50 hover:text-rose-700"
        style={{ padding: 'min(6px, 1.5cqmin)' }}
        aria-label={`Delete card ${index + 1}`}
        {...tourFieldAttr(
          'flashcards.card-delete',
          'flashcards',
          `row-${index + 1}`
        )}
      >
        <Trash2
          style={{
            width: 'min(17px, 4.5cqmin)',
            height: 'min(17px, 4.5cqmin)',
          }}
        />
      </button>
      {speak && (
        <SpeakCardRow
          card={card}
          index={index}
          dialects={speak.dialects}
          ipaDraft={ipaDraftFor(card, speak.ipaDrafts)}
          onIpaChange={speak.onIpaChange}
          onConfirm={speak.onConfirm}
        />
      )}
    </div>
  );
};
