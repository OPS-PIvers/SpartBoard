import React, { useContext, useRef, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { ImportAttributionLine } from '@/components/import/ImportAttributionLine';
import { useTranslation } from 'react-i18next';
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
import { FlashcardSetTargetsField } from './FlashcardSetTargetsField';
import { FlashcardLanguageField } from './FlashcardLanguageField';
import { PasteImportDrawer } from './PasteImportDrawer';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import { SpeakSettingsPanel } from './speak/SpeakSettingsPanel';
import { SpeakCardRow } from './speak/SpeakCardStatus';
import { SpeakReviewList } from './speak/SpeakReviewList';
import type { SpeakLookupCall } from './speak/lookupSpeakReferences';
import { ipaDraftFor } from './speak/speakEditorState';
import {
  MAX_FLASHCARDS_PER_SET,
  cleanFlashcards,
  useFlashcardEditorState,
  type SpeakRowProps,
} from './useFlashcardEditorState';

interface FlashcardEditorProps {
  initialSet: FlashcardSet;
  saving: boolean;
  onCancel: () => void;
  onSave: (set: FlashcardSet) => Promise<void>;
  /** Tests inject the reference lookup. */
  speakLookup?: SpeakLookupCall;
}

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

export const FlashcardEditor: React.FC<FlashcardEditorProps> = ({
  initialSet,
  saving,
  onCancel,
  onSave,
  speakLookup,
}) => {
  const { t } = useTranslation();
  const state = useFlashcardEditorState(initialSet, speakLookup);
  const canTag =
    useContext(AuthContext)?.canAccessFeature('flashcards-assign-v2') ?? false;
  const {
    canSpeak,
    title,
    setTitle,
    description,
    setDescription,
    targets,
    setTargets,
    termLanguage,
    setTermLanguage,
    definitionLanguage,
    setDefinitionLanguage,
    cards,
    setCards,
    error,
    setError,
    notice,
    speakSettings,
    setSpeakSettings,
    speakOn,
    speakRow,
    confirmSpeakCard,
    checkingCount,
    voiceFill,
    updateCard,
    insertCardAfter,
    removeCard,
    appendCards,
    lookupReferences,
    composeSet,
  } = state;
  const [pasteOpen, setPasteOpen] = useState(false);
  const savingRef = useRef(false);

  const jumpToCard = (id: string): void => {
    const row = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row?.querySelector<HTMLTextAreaElement>('textarea')?.focus({
      preventScroll: true,
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addCardAfter = (index: number): void => {
    const card = insertCardAfter(index);
    if (!card) return;
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
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await saveSet();
    } finally {
      savingRef.current = false;
    }
  };

  const saveSet = async (): Promise<void> => {
    const cleaned = cleanFlashcards(cards);
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
    const savedCards = await lookupReferences(
      cleaned.slice(0, MAX_FLASHCARDS_PER_SET)
    );
    await onSave(composeSet(savedCards));
  };

  return (
    <div className="flex h-full w-full bg-transparent">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-(--window-radius,0px) bg-white/95 backdrop-blur-xs">
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
              disabled={checkingCount > 0}
              className="rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
              style={{ padding: 'min(7px, 1.8cqmin)' }}
              aria-label="Back to flashcard library"
              {...tourTypeAttr('flashcards.editor-back', 'flashcards')}
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
              <p
                role="status"
                className="font-bold text-white empty:hidden"
                style={{ fontSize: 'min(11px, 3.5cqmin)' }}
              >
                {checkingCount > 0
                  ? t('flashcards.speak.editor.checkingCards', {
                      count: checkingCount,
                    })
                  : voiceFill
                    ? t('flashcards.speak.editor.finishingCards', {
                        ...voiceFill,
                      })
                    : null}
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
              disabled={checkingCount > 0}
              {...tourTypeAttr('flashcards.editor-paste', 'flashcards')}
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
              disabled={saving || checkingCount > 0}
              {...tourTypeAttr('flashcards.editor-save', 'flashcards')}
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
              {saving || checkingCount > 0 ? 'Saving…' : 'Save'}
            </button>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80"
          // Edits made during the lookup would be overwritten by its result.
          inert={checkingCount > 0}
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
              className="grid grid-cols-1 rounded-2xl border border-slate-200 bg-white shadow-xs [@container(min-width:680px)]:grid-cols-2"
              style={{
                gap: 'min(12px, 3cqmin)',
                padding: 'min(14px, 3.5cqmin)',
              }}
            >
              <label className="[@container(min-width:680px)]:col-span-2">
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
                  className="mt-1 w-full rounded-xl border border-slate-200 font-bold text-slate-900 outline-hidden focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                  style={{
                    padding: 'min(9px, 2.2cqmin)',
                    fontSize: 'min(15px, 4.6cqmin)',
                  }}
                  placeholder="Unit vocabulary"
                  {...tourTypeAttr('editor.title', 'flashcards')}
                />
                {initialSet.importedFrom && (
                  <ImportAttributionLine
                    attribution={initialSet.importedFrom}
                    className="mt-1 text-slate-500"
                    style={{ fontSize: 'min(11px, 3.4cqmin)' }}
                  />
                )}
              </label>
              <label className="[@container(min-width:680px)]:col-span-2">
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
                  className="mt-1 w-full rounded-xl border border-slate-200 text-slate-800 outline-hidden focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                  style={{
                    padding: 'min(8px, 2cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                  placeholder="What this set covers"
                  {...tourTypeAttr(
                    'flashcards.editor-description',
                    'flashcards'
                  )}
                />
              </label>
              {canTag && (
                <div className="[@container(min-width:680px)]:col-span-2">
                  <FlashcardSetTargetsField
                    targets={targets}
                    onChange={setTargets}
                  />
                </div>
              )}
              <FlashcardLanguageField
                label="Term language"
                value={termLanguage}
                onChange={setTermLanguage}
                tourField="term"
              />
              <FlashcardLanguageField
                label="Definition language"
                value={definitionLanguage}
                onChange={setDefinitionLanguage}
                tourField="definition"
              />
              {canSpeak && (
                <SpeakSettingsPanel
                  language={speakLanguageOf(termLanguage)}
                  settings={speakSettings}
                  onChange={setSpeakSettings}
                />
              )}
            </div>

            {speakOn && (
              <SpeakReviewList
                cards={cards}
                onJump={jumpToCard}
                onConfirm={confirmSpeakCard}
              />
            )}

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
                      onRemove={removeCard}
                      onAddAfter={addCardAfter}
                      speak={speakRow}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button
              type="button"
              onClick={() => addCardAfter(cards.length - 1)}
              disabled={cards.length >= 500}
              {...tourTypeAttr('flashcards.add-card', 'flashcards')}
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
          onImport={appendCards}
        />
      )}
    </div>
  );
};
