import React, { useContext, useEffect, useRef, useState } from 'react';
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
import type {
  FlashcardCard,
  FlashcardSet,
  FlashcardSpeakSettings,
  FlashcardsSpeakAdminConfig,
  SpeakDialect,
  SpeakLanguage,
} from '@/types';
import { FlashcardLanguageField } from './FlashcardLanguageField';
import { PasteImportDrawer } from './PasteImportDrawer';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { AuthContext } from '@/context/AuthContextValue';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import { readFlashcardsSpeakAdminConfig } from '@/hooks/useFlashcardSets';
import { SpeakSettingsPanel } from './speak/SpeakSettingsPanel';
import { SpeakCardRow } from './speak/SpeakCardStatus';
import { SpeakReviewList } from './speak/SpeakReviewList';
import {
  attachSpeakReferences,
  cardsNeedingLookup,
  type SpeakLookupCall,
} from './speak/lookupSpeakReferences';
import {
  initialSpeakSettings,
  ipaDraftFor,
  settingsFitLanguage,
  speakForTerm,
  type SpeakIpaDrafts,
} from './speak/speakEditorState';
import { useVoiceFillProgress } from './speak/speakVoiceFill';

interface FlashcardEditorProps {
  initialSet: FlashcardSet;
  saving: boolean;
  onCancel: () => void;
  onSave: (set: FlashcardSet) => Promise<void>;
  /** Tests inject the reference lookup. */
  speakLookup?: SpeakLookupCall;
}

interface SpeakRowProps {
  dialects: readonly SpeakDialect[];
  ipaDrafts: SpeakIpaDrafts;
  onIpaChange: (
    cardId: string,
    ipa: Partial<Record<SpeakDialect, string>>
  ) => void;
  onConfirm: (cardId: string) => void;
}

interface SortableCardRowProps {
  card: FlashcardCard;
  index: number;
  onChange: (id: string, updates: Partial<FlashcardCard>) => void;
  onRemove: (id: string) => void;
  onAddAfter: (index: number) => void;
  speak: SpeakRowProps | null;
}

const SortableCardRow: React.FC<SortableCardRowProps> = ({
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
  speakLookup,
}) => {
  const { t } = useTranslation();
  const canSpeak =
    useContext(AuthContext)?.canAccessFeature('flashcards-speak') ?? false;
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
  const [speakAdmin, setSpeakAdmin] =
    useState<FlashcardsSpeakAdminConfig | null>(null);
  // Speak settings the teacher has touched, keyed by the language they were made for.
  const [speakEdit, setSpeakEdit] = useState<{
    language: SpeakLanguage;
    settings: FlashcardSpeakSettings;
  } | null>(null);
  const [ipaDrafts, setIpaDrafts] = useState<SpeakIpaDrafts>({});
  const [checkingCount, setCheckingCount] = useState(0);
  const savingRef = useRef(false);

  const speakLanguage = canSpeak ? speakLanguageOf(termLanguage) : null;
  const voiceFill = useVoiceFillProgress().get(initialSet.id);

  useEffect(() => {
    if (!canSpeak) return;
    let cancelled = false;
    void readFlashcardsSpeakAdminConfig().then((config) => {
      if (!cancelled) setSpeakAdmin(config);
    });
    return () => {
      cancelled = true;
    };
  }, [canSpeak]);

  const savedSpeak =
    speakLanguage && settingsFitLanguage(initialSet.speak, speakLanguage)
      ? initialSet.speak
      : undefined;
  const speakSettings: FlashcardSpeakSettings | null = !speakLanguage
    ? null
    : speakEdit?.language === speakLanguage
      ? speakEdit.settings
      : speakAdmin
        ? initialSpeakSettings(termLanguage, savedSpeak, speakAdmin)
        : null;
  const speakOn = speakLanguage !== null && speakSettings !== null;

  const setSpeakSettings = (settings: FlashcardSpeakSettings): void => {
    if (speakLanguage) setSpeakEdit({ language: speakLanguage, settings });
  };

  const confirmSpeakCard = (id: string): void => {
    setCards((current) =>
      current.map((card) => {
        const speak = speakForTerm(card);
        return card.id === id && speak
          ? { ...card, speak: { ...speak, confirmedAt: Date.now() } }
          : card;
      })
    );
  };

  const jumpToCard = (id: string): void => {
    const row = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row?.querySelector<HTMLTextAreaElement>('textarea')?.focus({
      preventScroll: true,
    });
  };

  const speakRow: SpeakRowProps | null =
    speakOn && speakSettings
      ? {
          dialects: speakSettings.dialects,
          ipaDrafts,
          onIpaChange: (cardId, ipa) => {
            const term = cards.find((card) => card.id === cardId)?.term ?? '';
            setIpaDrafts((current) => ({
              ...current,
              [cardId]: { term: term.trim(), ipa },
            }));
          },
          onConfirm: confirmSpeakCard,
        }
      : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await saveSet();
    } finally {
      savingRef.current = false;
    }
  };

  const saveSet = async (): Promise<void> => {
    const cleaned = cards
      .map((card) => {
        const term = card.term.trim();
        const next = { ...card, term, definition: card.definition.trim() };
        // References belong to the term they were computed for.
        if (next.speak && next.speak.term !== term) delete next.speak;
        return next;
      })
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
    let savedCards = cleaned.slice(0, 500);
    if (speakOn && speakLanguage && speakSettings) {
      const pending = cardsNeedingLookup(
        savedCards,
        speakSettings.dialects,
        ipaDrafts
      ).length;
      if (pending > 0) {
        setCheckingCount(pending);
        try {
          savedCards = await attachSpeakReferences(
            savedCards,
            speakLanguage,
            speakSettings.dialects,
            ipaDrafts,
            speakLookup
          );
        } finally {
          setCheckingCount(0);
        }
        setCards(savedCards);
        setIpaDrafts({});
      }
    }
    // F22: a set keeps the district defaults until its own Speak settings are first changed.
    const speak = !speakOn
      ? initialSet.speak
      : speakSettings && (speakEdit?.language === speakLanguage || savedSpeak)
        ? speakSettings
        : undefined;
    const { speak: _previousSpeak, ...rest } = initialSet;
    await onSave({
      ...rest,
      ...(speak ? { speak } : {}),
      title: title.trim(),
      description: description.trim(),
      termLanguage: termLanguage.trim() || 'en-US',
      definitionLanguage: definitionLanguage.trim() || 'en-US',
      cards: savedCards,
      updatedAt: Date.now(),
    });
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
                      onRemove={(id) =>
                        setCards((current) =>
                          current.length === 1
                            ? [{ ...current[0], term: '', definition: '' }]
                            : current.filter((entry) => entry.id !== id)
                        )
                      }
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
