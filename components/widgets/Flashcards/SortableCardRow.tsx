import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { FlashcardCard } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { SpeakCardRow } from './speak/SpeakCardStatus';
import { ipaDraftFor } from './speak/speakEditorState';
import type { SpeakRowProps } from './useFlashcardEditorState';
import { AnswerAltFields, AnswerMainField } from './AnswerRowFields';
import {
  ANSWER_FIELD_CLASS,
  answerFieldStyle,
  useAnswerRows,
} from './useAnswerRows';

interface SortableCardRowProps {
  card: FlashcardCard;
  index: number;
  isLast: boolean;
  onChange: (id: string, updates: Partial<FlashcardCard>) => void;
  onRemove: (id: string) => void;
  onAddAfter: (index: number) => void;
  speak: SpeakRowProps | null;
  /** Accepted answers as rows (flag flashcard-answer-rows). */
  answerRows: boolean;
  termLanguage: string;
  definitionLanguage: string;
}

export const SortableCardRow: React.FC<SortableCardRowProps> = ({
  card,
  index,
  isLast,
  onChange,
  onRemove,
  onAddAfter,
  speak,
  answerRows,
  termLanguage,
  definitionLanguage,
}) => {
  const fieldKey = `row-${index + 1}`;
  const termRows = useAnswerRows(
    card.id,
    'term',
    card.term,
    termLanguage,
    (term) => onChange(card.id, { term })
  );
  const definitionRows = useAnswerRows(
    card.id,
    'definition',
    card.definition,
    definitionLanguage,
    (definition) => onChange(card.id, { definition })
  );
  const addOnEnterOrTabOut = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ): void => {
    if (event.shiftKey || event.nativeEvent.isComposing) return;
    const tabOut =
      event.key === 'Tab' &&
      isLast &&
      (card.term.trim() !== '' || card.definition.trim() !== '');
    if (event.key === 'Enter' || tabOut) {
      event.preventDefault();
      onAddAfter(index);
    }
  };
  const hasAlternates =
    answerRows && (termRows.rows.length > 1 || definitionRows.rows.length > 1);

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
      className={`relative grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center ${
        isDragging ? 'z-10 bg-white opacity-80 shadow-lg' : ''
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        gap: 'min(8px, 2cqmin)',
        padding: 'min(12px, 3cqmin) min(4px, 1cqmin)',
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
        className="min-w-[3ch] text-right font-black tabular-nums text-slate-300"
        style={{ fontSize: 'min(12px, 3.8cqmin)' }}
      >
        {index + 1}
      </span>
      {answerRows ? (
        <>
          <AnswerMainField
            answers={termRows}
            cardId={card.id}
            side="term"
            label={`Term ${index + 1}`}
            placeholder="Term"
            maxLength={500}
            fieldKey={fieldKey}
            textareaAnchor={tourFieldAttr(
              'flashcards.card-term',
              'flashcards',
              fieldKey
            )}
          />
          <AnswerMainField
            answers={definitionRows}
            cardId={card.id}
            side="definition"
            label={`Definition ${index + 1}`}
            placeholder="Definition"
            maxLength={1000}
            fieldKey={fieldKey}
            onKeyDown={
              definitionRows.rows.length > 1
                ? (event) => {
                    if (event.key === 'Enter') addOnEnterOrTabOut(event);
                  }
                : addOnEnterOrTabOut
            }
            textareaAnchor={tourFieldAttr(
              'flashcards.card-definition',
              'flashcards',
              fieldKey
            )}
          />
        </>
      ) : (
        <>
          <label className="min-w-0">
            <span className="sr-only">Term {index + 1}</span>
            <textarea
              value={card.term}
              onChange={(event) =>
                onChange(card.id, { term: event.target.value })
              }
              maxLength={500}
              rows={1}
              className={ANSWER_FIELD_CLASS}
              style={answerFieldStyle()}
              placeholder="Term"
              {...tourFieldAttr('flashcards.card-term', 'flashcards', fieldKey)}
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Definition {index + 1}</span>
            <textarea
              value={card.definition}
              onChange={(event) =>
                onChange(card.id, { definition: event.target.value })
              }
              onKeyDown={addOnEnterOrTabOut}
              maxLength={1000}
              rows={1}
              className={ANSWER_FIELD_CLASS}
              style={answerFieldStyle()}
              placeholder="Definition"
              {...tourFieldAttr(
                'flashcards.card-definition',
                'flashcards',
                fieldKey
              )}
            />
          </label>
        </>
      )}
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
      {!isDragging && (
        <>
          <div
            aria-hidden
            className="peer absolute inset-x-0 -bottom-2 z-10 h-4"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onAddAfter(index)}
            className="absolute bottom-0 left-0 z-10 col-start-4 flex items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 opacity-0 shadow-xs transition-opacity peer-hover:opacity-100 hover:opacity-100 hover:border-slate-400 hover:text-slate-800 touch:opacity-100"
            style={{
              width: 'min(20px, 5cqmin)',
              height: 'min(20px, 5cqmin)',
              transform: 'translate(calc(-50% - min(4px, 1cqmin)), 50%)',
            }}
            aria-label={`Add card after card ${index + 1}`}
            title="Add card here"
            {...tourFieldAttr(
              'flashcards.card-insert',
              'flashcards',
              `row-${index + 1}`
            )}
          >
            <Plus
              style={{
                width: 'min(13px, 3.5cqmin)',
                height: 'min(13px, 3.5cqmin)',
              }}
            />
          </button>
        </>
      )}
      {hasAlternates && (
        <>
          <AnswerAltFields
            answers={termRows}
            cardId={card.id}
            side="term"
            label={`Term ${index + 1}`}
            maxLength={500}
            className="col-start-3"
          />
          <AnswerAltFields
            answers={definitionRows}
            cardId={card.id}
            side="definition"
            label={`Definition ${index + 1}`}
            maxLength={1000}
            className="col-start-4"
            onLastKeyDown={addOnEnterOrTabOut}
          />
        </>
      )}
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
