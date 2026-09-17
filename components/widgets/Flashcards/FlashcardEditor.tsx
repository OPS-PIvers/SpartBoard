import React, { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  ClipboardPaste,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import type { FlashcardCard, FlashcardSet } from '@/types';
import { QUIZ_READ_ALOUD_LANGUAGES } from '@/config/quizReadAloud';
import { PasteImportDrawer } from './PasteImportDrawer';

interface FlashcardEditorProps {
  initialSet: FlashcardSet;
  saving: boolean;
  onCancel: () => void;
  onSave: (set: FlashcardSet) => Promise<void>;
}

interface SortableCardRowProps {
  card: FlashcardCard;
  index: number;
  onChange: (id: string, updates: Partial<FlashcardCard>) => void;
  onRemove: (id: string) => void;
  onAddAfter: (index: number) => void;
}

const SortableCardRow: React.FC<SortableCardRowProps> = ({
  card,
  index,
  onChange,
  onRemove,
  onAddAfter,
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
      className={`grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.25fr)_auto] items-start rounded-2xl border bg-white shadow-sm ${
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
        className="pt-2 font-black tabular-nums text-slate-300"
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
          className="w-full resize-none rounded-xl border border-slate-200 text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
          style={{
            padding: 'min(8px, 2cqmin)',
            fontSize: 'min(13px, 4cqmin)',
          }}
          placeholder="Term"
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
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onAddAfter(index);
            }
          }}
          maxLength={1000}
          rows={2}
          className="w-full resize-none rounded-xl border border-slate-200 text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
          style={{
            padding: 'min(8px, 2cqmin)',
            fontSize: 'min(13px, 4cqmin)',
          }}
          placeholder="Definition"
        />
      </label>
      <button
        type="button"
        onClick={() => onRemove(card.id)}
        className="rounded-lg text-rose-600/70 hover:bg-rose-50 hover:text-rose-700"
        style={{ padding: 'min(6px, 1.5cqmin)' }}
        aria-label={`Delete card ${index + 1}`}
      >
        <Trash2
          style={{
            width: 'min(17px, 4.5cqmin)',
            height: 'min(17px, 4.5cqmin)',
          }}
        />
      </button>
    </div>
  );
};

const newCard = (): FlashcardCard => ({
  id: crypto.randomUUID(),
  term: '',
  definition: '',
});

export const FlashcardEditor: React.FC<FlashcardEditorProps> = ({
  initialSet,
  saving,
  onCancel,
  onSave,
}) => {
  const [title, setTitle] = useState(initialSet.title);
  const [description, setDescription] = useState(initialSet.description ?? '');
  const [termLanguage, setTermLanguage] = useState(initialSet.termLanguage);
  const [definitionLanguage, setDefinitionLanguage] = useState(
    initialSet.definitionLanguage
  );
  const [cards, setCards] = useState<FlashcardCard[]>(
    initialSet.cards.length > 0 ? initialSet.cards : [newCard(), newCard()]
  );
  const [pasteOpen, setPasteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const languageOptions = useMemo(
    () => QUIZ_READ_ALOUD_LANGUAGES.map(({ tag }) => tag),
    []
  );

  const updateCard = (id: string, updates: Partial<FlashcardCard>): void => {
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, ...updates } : card))
    );
  };

  const addCardAfter = (index: number): void => {
    if (cards.length >= 500) {
      setNotice('A set can contain up to 500 cards.');
      return;
    }
    const card = newCard();
    setCards((current) => [
      ...current.slice(0, index + 1),
      card,
      ...current.slice(index + 1),
    ]);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>(
        `[data-card-id="${card.id}"] textarea`
      );
      input?.focus();
    });
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCards((current) => {
      const from = current.findIndex((card) => card.id === active.id);
      const to = current.findIndex((card) => card.id === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  const handleSave = async (): Promise<void> => {
    const cleaned = cards
      .map((card) => ({
        ...card,
        term: card.term.trim(),
        definition: card.definition.trim(),
      }))
      .filter((card) => card.term !== '' || card.definition !== '');
    if (!title.trim()) {
      setError('Give this set a title.');
      return;
    }
    if (cleaned.length === 0) {
      setError('Add at least one complete card.');
      return;
    }
    if (cleaned.some((card) => !card.term || !card.definition)) {
      setError('Every card needs both a term and a definition.');
      return;
    }
    setError(null);
    await onSave({
      ...initialSet,
      title: title.trim(),
      description: description.trim(),
      termLanguage: termLanguage.trim() || 'en-US',
      definitionLanguage: definitionLanguage.trim() || 'en-US',
      cards: cleaned.slice(0, 500),
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="flex h-full w-full bg-transparent">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--window-radius,0px)] bg-white/95 backdrop-blur-sm">
        <header
          className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-900 text-white"
          style={{
            gap: 'min(12px, 3cqmin)',
            padding: 'min(12px, 3cqmin) min(16px, 4cqmin)',
          }}
        >
          <div
            className="flex min-w-0 items-center"
            style={{ gap: 'min(10px, 2.5cqmin)' }}
          >
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
              style={{ padding: 'min(7px, 1.8cqmin)' }}
              aria-label="Back to flashcard library"
            >
              <ArrowLeft
                style={{
                  width: 'min(19px, 5cqmin)',
                  height: 'min(19px, 5cqmin)',
                }}
              />
            </button>
            <div className="min-w-0">
              <h2
                className="truncate font-black"
                style={{ fontSize: 'min(17px, 5.2cqmin)' }}
              >
                {initialSet.title ? 'Edit set' : 'New set'}
              </h2>
              <p
                className="text-white/60"
                style={{ fontSize: 'min(10px, 3.2cqmin)' }}
              >
                {cards.length} / 500 cards
              </p>
            </div>
          </div>
          <div
            className="flex shrink-0 items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 font-bold text-white hover:bg-white/20"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
            >
              <ClipboardPaste
                style={{
                  width: 'min(15px, 4cqmin)',
                  height: 'min(15px, 4cqmin)',
                }}
              />
              Paste
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center rounded-xl bg-rose-600 font-black text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
            >
              <Save
                style={{
                  width: 'min(15px, 4cqmin)',
                  height: 'min(15px, 4cqmin)',
                }}
              />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80"
          style={{ padding: 'min(16px, 4cqmin)' }}
        >
          <div
            className="mx-auto w-full"
            style={{
              display: 'grid',
              gap: 'min(14px, 3.5cqmin)',
              maxWidth: '1024px',
            }}
          >
            <div
              className="grid grid-cols-1 rounded-2xl border border-slate-200 bg-white shadow-sm @[640px]:grid-cols-2"
              style={{
                gap: 'min(12px, 3cqmin)',
                padding: 'min(14px, 3.5cqmin)',
              }}
            >
              <label className="@[640px]:col-span-2">
                <span
                  className="font-black uppercase tracking-widest text-slate-500"
                  style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                >
                  Title
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className="mt-1 w-full rounded-xl border border-slate-200 font-bold text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                  style={{
                    padding: 'min(9px, 2.2cqmin)',
                    fontSize: 'min(15px, 4.6cqmin)',
                  }}
                  placeholder="Unit vocabulary"
                />
              </label>
              <label className="@[640px]:col-span-2">
                <span
                  className="font-black uppercase tracking-widest text-slate-500"
                  style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                >
                  Description (optional)
                </span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={300}
                  className="mt-1 w-full rounded-xl border border-slate-200 text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                  style={{
                    padding: 'min(8px, 2cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                  placeholder="What this set covers"
                />
              </label>
              {(
                [
                  ['Term language', termLanguage, setTermLanguage],
                  [
                    'Definition language',
                    definitionLanguage,
                    setDefinitionLanguage,
                  ],
                ] as const
              ).map(([label, value, setValue]) => (
                <label key={label}>
                  <span
                    className="font-black uppercase tracking-widest text-slate-500"
                    style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                  >
                    {label}
                  </span>
                  <input
                    list="flashcard-language-options"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                    style={{
                      padding: 'min(8px, 2cqmin)',
                      fontSize: 'min(13px, 4cqmin)',
                    }}
                    placeholder="en-US"
                  />
                </label>
              ))}
              <datalist id="flashcard-language-options">
                {languageOptions.map((language) => (
                  <option key={language} value={language} />
                ))}
              </datalist>
            </div>

            {(error != null || notice != null) && (
              <div
                className={`rounded-xl font-bold ${error ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}
                style={{
                  padding: 'min(10px, 2.5cqmin)',
                  fontSize: 'min(11px, 3.5cqmin)',
                }}
              >
                {error ?? notice}
              </div>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={cards.map((card) => card.id)}
                strategy={verticalListSortingStrategy}
              >
                <div style={{ display: 'grid', gap: 'min(10px, 2.5cqmin)' }}>
                  {cards.map((card, index) => (
                    <SortableCardRow
                      key={card.id}
                      card={card}
                      index={index}
                      onChange={updateCard}
                      onRemove={(id) =>
                        setCards((current) =>
                          current.length === 1
                            ? [{ ...current[0], term: '', definition: '' }]
                            : current.filter((entry) => entry.id !== id)
                        )
                      }
                      onAddAfter={addCardAfter}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button
              type="button"
              onClick={() => addCardAfter(cards.length - 1)}
              disabled={cards.length >= 500}
              className="inline-flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-rose-200 font-black text-rose-700 hover:border-rose-300 hover:bg-rose-50 disabled:opacity-40"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(12px, 3cqmin)',
                fontSize: 'min(12px, 3.8cqmin)',
              }}
            >
              <Plus
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />
              Add card
            </button>
          </div>
        </div>
      </section>

      {pasteOpen && (
        <PasteImportDrawer
          onClose={() => setPasteOpen(false)}
          onImport={(importedCards) => {
            setCards((current) => {
              const withoutEmptyStarter = current.every(
                (card) => !card.term && !card.definition
              )
                ? []
                : current;
              const combined = [...withoutEmptyStarter, ...importedCards];
              if (combined.length > 500) {
                setNotice('Only the first 500 cards were kept.');
              }
              return combined.slice(0, 500);
            });
          }}
        />
      )}
    </div>
  );
};
