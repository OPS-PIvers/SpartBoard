import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ChevronDown,
  ClipboardPaste,
  GripVertical,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { FlashcardCard, FlashcardSet } from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { SortableList } from '@/components/common/SortableList';
import { ImportAttributionLine } from '@/components/import/ImportAttributionLine';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDialog } from '@/context/useDialog';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import {
  inputClass,
  labelClass,
} from '@/components/widgets/QuizWidget/components/quizEditorFieldStyles';
import { FlashcardLanguageField } from './FlashcardLanguageField';
import { PasteImportDrawer } from './PasteImportDrawer';
import { SpeakSettingsPanel } from './speak/SpeakSettingsPanel';
import { SpeakCardRow, SpeakStatusLabel } from './speak/SpeakCardStatus';
import { SpeakReviewList } from './speak/SpeakReviewList';
import { ipaDraftFor, speakForTerm } from './speak/speakEditorState';
import type { SpeakLookupCall } from './speak/lookupSpeakReferences';
import {
  MAX_FLASHCARDS_PER_SET,
  cleanFlashcards,
  flashcardSetIncompleteReason,
  useFlashcardEditorState,
} from './useFlashcardEditorState';
import { FlashcardAiOverlay } from './FlashcardAiOverlay';
import { useFlashcardAiDraft } from './useFlashcardAiDraft';

const EDITOR_TAB_ANCHORS = {
  cards: tourTypeAttr('flashcards-editor.tab-cards', 'flashcards'),
  languages: tourTypeAttr('flashcards-editor.tab-languages', 'flashcards'),
} as const;

type EditorTab = keyof typeof EDITOR_TAB_ANCHORS;

interface FlashcardSetEditorModalProps {
  set: FlashcardSet;
  /** Not saved yet: an untouched new set is never written, a prefilled one (paste, import) is. */
  isNew: boolean;
  /** Writes the set. `final` is the write on Close, which also refreshes open Study assignments. */
  onPersist: (set: FlashcardSet, options: { final: boolean }) => Promise<void>;
  onClose: () => void;
  /** Offers Draft with AI. */
  aiEnabled: boolean;
  /** Tests inject the reference lookup. */
  speakLookup?: SpeakLookupCall;
}

/** The Flashcards set editor in Quiz's dialog: card list on the left, the selected card on the right, saved as you type. */
export const FlashcardSetEditorModal: React.FC<
  FlashcardSetEditorModalProps
> = ({ set, isNew, onPersist, onClose, aiEnabled, speakLookup }) => {
  const { t } = useTranslation();
  const state = useFlashcardEditorState(set, speakLookup);
  const {
    canSpeak,
    title,
    setTitle,
    description,
    setDescription,
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
  const [tab, setTab] = useState<EditorTab>('cards');
  const [selectedId, setSelectedId] = useState<string | null>(
    cards[0]?.id ?? null
  );
  const [pasteOpen, setPasteOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(addMenuRef, () => setAddMenuOpen(false));
  const termRef = useRef<HTMLTextAreaElement>(null);
  const persistedRef = useRef(false);
  const closingRef = useRef(false);
  // Set once Close starts, so the unmount flush doesn't write the set a second time.
  const finishingRef = useRef(false);
  const { showConfirm } = useDialog();

  const ai = useFlashcardAiDraft({
    onDrafted: (drafted, draftTitle) => {
      appendCards(drafted);
      if (draftTitle) {
        setTitle((current) =>
          current.trim() ? current : draftTitle.slice(0, 120)
        );
      }
      if (drafted[0]) setSelectedId(drafted[0].id);
      setTab('cards');
    },
  });

  const selectedIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedId)
  );
  const selected = cards[selectedIndex] ?? null;

  const focusTerm = (): void => {
    requestAnimationFrame(() => termRef.current?.focus());
  };

  const addCardAfter = (index: number): void => {
    const card = insertCardAfter(index);
    if (!card) return;
    setSelectedId(card.id);
    setTab('cards');
    focusTerm();
  };

  const deleteCard = (id: string): void => {
    const index = cards.findIndex((card) => card.id === id);
    if (id === selectedId && cards.length > 1) {
      setSelectedId(cards[index + 1]?.id ?? cards[index - 1]?.id ?? null);
    }
    removeCard(id);
  };

  const jumpToCard = (id: string): void => {
    setSelectedId(id);
    setTab('cards');
    focusTerm();
  };

  const draftToken = useMemo(
    () => [
      title,
      description,
      termLanguage,
      definitionLanguage,
      cards,
      state.speakEdit,
    ],
    [
      title,
      description,
      termLanguage,
      definitionLanguage,
      cards,
      state.speakEdit,
    ]
  );

  const incompleteNotice = flashcardSetIncompleteReason({ title, cards });

  const hasContent = title.trim() !== '' || cleanFlashcards(cards).length > 0;

  // Persist only; Speak lookups wait for Close so typing never starts one.
  const persistDraft = async (): Promise<void> => {
    // A new set is only written once it has a title or a card.
    if (finishingRef.current || (isNew && !hasContent && !persistedRef.current))
      return;
    setError(null);
    await onPersist(composeSet(cleanFlashcards(cards)), { final: false });
    persistedRef.current = true;
  };

  // The shell has already flushed autosave; this runs the lookups and the last write.
  const finishAndClose = async (): Promise<void> => {
    if (closingRef.current) return;
    const cleaned = cleanFlashcards(cards);
    // An untouched set (even one missing Speak references) closes without a write.
    const prefilledNew = isNew && set.cards.length > 0 && hasContent;
    if (!persistedRef.current && !prefilledNew) {
      onClose();
      return;
    }
    closingRef.current = true;
    finishingRef.current = true;
    try {
      const looked = await lookupReferences(cleaned);
      await onPersist(composeSet(looked), { final: true });
      onClose();
      return;
    } catch (err) {
      console.error('Flashcard set final save failed.', err);
    } finally {
      closingRef.current = false;
    }
    const leave = await showConfirm(
      'Your latest changes could not be saved. Closing now will lose them.',
      {
        title: 'Close without saving?',
        variant: 'warning',
        confirmLabel: 'Close anyway',
        cancelLabel: 'Keep editing',
      }
    );
    if (leave) {
      onClose();
      return;
    }
    finishingRef.current = false;
    setError('Could not save your changes. Please try again.');
  };

  const statusLine =
    checkingCount > 0
      ? t('flashcards.speak.editor.checkingCards', { count: checkingCount })
      : voiceFill
        ? t('flashcards.speak.editor.finishingCards', { ...voiceFill })
        : null;

  const subtitle = (
    <span className="inline-flex items-center gap-2">
      <span>
        {cards.length} {cards.length === 1 ? 'card' : 'cards'}
      </span>
      {statusLine && (
        <span role="status" className="font-bold text-slate-700">
          {statusLine}
        </span>
      )}
    </span>
  );

  const footerExtras = aiEnabled ? (
    <button
      type="button"
      onClick={() => ai.setOpen(true)}
      {...tourTypeAttr('flashcards-editor.footer-draft-ai', 'flashcards')}
      className="h-[36px] px-3 bg-white border border-slate-200 hover:border-brand-blue-light text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider shadow-xs transition-colors flex items-center gap-2"
      title="Generate with AI"
    >
      <Wand2 className="w-4 h-4" />
      Draft with AI
    </button>
  ) : null;

  const tabs = (
    <div className="px-4 pt-3 pb-0 border-b border-slate-200 bg-white shrink-0 flex gap-1">
      {(Object.keys(EDITOR_TAB_ANCHORS) as EditorTab[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          {...EDITOR_TAB_ANCHORS[key]}
          className={`px-3 py-2 rounded-t-lg text-xs font-black uppercase tracking-wider transition-colors ${
            tab === key
              ? 'bg-brand-blue-primary text-white'
              : 'text-slate-500 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/30'
          }`}
        >
          {key === 'cards' ? 'Cards' : t('quizTranslation.editor.tab')}
        </button>
      ))}
    </div>
  );

  const banner = (error ?? notice) && (
    <div
      role={error ? 'alert' : 'status'}
      className={`p-2.5 rounded-lg flex items-center gap-2 text-xs font-bold ${
        error
          ? 'bg-brand-red-lighter/40 border border-brand-red-primary/20 text-brand-red-dark'
          : 'bg-amber-50 border border-amber-200 text-amber-900'
      }`}
    >
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
      {error ?? notice}
    </div>
  );

  const cardsPane = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-white shrink-0">
        <label className="block">
          <span className={labelClass}>Description (optional)</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            className={inputClass}
            placeholder="What this set covers"
            {...tourTypeAttr('flashcards.editor-description', 'flashcards')}
          />
        </label>
        {set.importedFrom && (
          <ImportAttributionLine
            attribution={set.importedFrom}
            className="text-xs text-slate-500"
          />
        )}
        {banner}
        {speakOn && (
          <SpeakReviewList
            cards={cards}
            onJump={jumpToCard}
            onConfirm={confirmSpeakCard}
          />
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-50 px-5 pb-5 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Cards ({cards.length})
          </h4>
          <div className="flex items-center gap-2">
            {aiEnabled && (
              <button
                type="button"
                onClick={() => ai.setOpen(true)}
                {...tourTypeAttr('flashcards-editor.draft-ai', 'flashcards')}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                title="Generate cards with AI"
              >
                <Wand2 className="w-3.5 h-3.5 text-slate-500" />
                Draft with AI
              </button>
            )}
            <div ref={addMenuRef} className="relative flex items-stretch">
              <button
                type="button"
                onClick={() => addCardAfter(cards.length - 1)}
                disabled={cards.length >= MAX_FLASHCARDS_PER_SET}
                className="flex items-center gap-1 pl-2.5 pr-2 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-l-lg text-xs font-bold transition-colors disabled:opacity-50"
                {...tourTypeAttr('flashcards.add-card', 'flashcards')}
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddMenuOpen((open) => !open)}
                aria-label="More ways to add"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                className="flex items-center px-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-r-lg border-l border-white/25 transition-colors"
                {...tourTypeAttr('flashcards-editor.add-menu', 'flashcards')}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {addMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-20"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      addCardAfter(cards.length - 1);
                    }}
                    {...tourTypeAttr(
                      'flashcards-editor.add-blank',
                      'flashcards'
                    )}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Blank card
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      setPasteOpen(true);
                    }}
                    {...tourTypeAttr('flashcards.editor-paste', 'flashcards')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Paste cards
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <SortableList
          items={cards}
          getId={(card) => card.id}
          onReorder={(next) => setCards(next)}
          className="space-y-1.5"
          renderItem={(card, handle, index) => (
            <CardRow
              card={card}
              index={index}
              selected={card.id === selected?.id}
              speakShown={speakOn}
              onSelect={setSelectedId}
              onDelete={deleteCard}
              dragHandle={handle}
            />
          )}
        />
      </div>
    </div>
  );

  const cardDetail = selected ? (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">
          Card {selectedIndex + 1} of {cards.length}
        </div>
        <h4 className="text-base font-bold text-slate-900 truncate mt-0.5">
          {selected.term.trim() || `Card ${selectedIndex + 1}`}
        </h4>
      </div>
      <div className="flex-1 px-5 py-4 space-y-4">
        <label className="block">
          <span className={labelClass}>Term</span>
          <textarea
            ref={termRef}
            value={selected.term}
            onChange={(event) =>
              updateCard(selected.id, { term: event.target.value })
            }
            maxLength={500}
            rows={2}
            className={`${inputClass} resize-none`}
            aria-label={`Term ${selectedIndex + 1}`}
            {...tourFieldAttr(
              'flashcards.card-term',
              'flashcards',
              `row-${selectedIndex + 1}`
            )}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Definition</span>
          <textarea
            value={selected.definition}
            onChange={(event) =>
              updateCard(selected.id, { definition: event.target.value })
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                addCardAfter(selectedIndex);
              }
            }}
            maxLength={1000}
            rows={4}
            className={`${inputClass} resize-none`}
            aria-label={`Definition ${selectedIndex + 1}`}
            {...tourFieldAttr(
              'flashcards.card-definition',
              'flashcards',
              `row-${selectedIndex + 1}`
            )}
          />
        </label>
        {speakRow && (
          <SpeakCardRow
            card={selected}
            index={selectedIndex}
            dialects={speakRow.dialects}
            ipaDraft={ipaDraftFor(selected, speakRow.ipaDrafts)}
            onIpaChange={speakRow.onIpaChange}
            onConfirm={speakRow.onConfirm}
          />
        )}
      </div>
    </div>
  ) : null;

  const languagesPane = (
    <div className="px-5 py-4 space-y-4 bg-white h-full">
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
    </div>
  );

  const speakPane = canSpeak ? (
    <div className="px-5 py-4">
      <SpeakSettingsPanel
        language={speakLanguageOf(termLanguage)}
        settings={speakSettings}
        onChange={setSpeakSettings}
      />
    </div>
  ) : null;

  return (
    <EditorWorkspace
      isOpen
      title={title}
      onTitleChange={setTitle}
      titlePlaceholder="Set title"
      tourScope="flashcards"
      subtitle={subtitle}
      isDirty={false}
      onSave={persistDraft}
      autosave={{
        draftToken,
        resetKey: set.id,
        enabled: checkingCount === 0,
      }}
      incompleteNotice={hasContent ? incompleteNotice : null}
      onClose={() => void finishAndClose()}
      footerExtras={footerExtras}
      contextPane={
        <div className="flex flex-col h-full" inert={checkingCount > 0}>
          {tabs}
          {tab === 'cards' ? cardsPane : languagesPane}
        </div>
      }
      detailPane={
        <div className="h-full" inert={checkingCount > 0}>
          {tab === 'cards' ? cardDetail : speakPane}
        </div>
      }
      overlay={
        <>
          <FlashcardAiOverlay draft={ai} />
          {pasteOpen && (
            <PasteImportDrawer
              onClose={() => setPasteOpen(false)}
              onImport={(imported) => {
                appendCards(imported);
                if (imported[0]) setSelectedId(imported[0].id);
              }}
            />
          )}
        </>
      }
    />
  );
};

interface CardRowProps {
  card: FlashcardCard;
  index: number;
  selected: boolean;
  speakShown: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  dragHandle: {
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners: Record<string, (event: Event) => void> | undefined;
  };
}

const CardRow: React.FC<CardRowProps> = ({
  card,
  index,
  selected,
  speakShown,
  onSelect,
  onDelete,
  dragHandle,
}) => {
  const speak = speakShown ? speakForTerm(card) : undefined;
  const flagged =
    speak?.status === 'needs-review' && !speak.confirmedAt ? speak : undefined;
  return (
    <div
      onClick={() => onSelect(card.id)}
      data-card-id={card.id}
      {...tourFieldAttr(
        'flashcards-editor.card-row',
        'flashcards',
        String(index + 1)
      )}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-white cursor-pointer transition-all ${
        selected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/15'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <button
        type="button"
        {...dragHandle.attributes}
        onPointerDown={
          dragHandle.listeners?.onPointerDown as
            React.PointerEventHandler<HTMLButtonElement> | undefined
        }
        onKeyDown={
          dragHandle.listeners?.onKeyDown as
            React.KeyboardEventHandler<HTMLButtonElement> | undefined
        }
        onClick={(event) => event.stopPropagation()}
        aria-label={`Move card ${index + 1}`}
        {...tourFieldAttr(
          'flashcards.card-move',
          'flashcards',
          `row-${index + 1}`
        )}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none p-0.5"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-slate-400 font-mono font-bold text-xs w-6 shrink-0 text-center">
        {index + 1}
      </span>
      <span className="flex-1 min-w-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 items-baseline">
        <span className="text-sm font-semibold text-slate-800 truncate">
          {card.term || (
            <span className="italic font-normal text-slate-400">Term</span>
          )}
        </span>
        <span className="text-sm text-slate-500 truncate">
          {card.definition || (
            <span className="italic text-slate-400">Definition</span>
          )}
        </span>
      </span>
      {flagged && (
        <span className="shrink-0">
          <SpeakStatusLabel speak={flagged} />
        </span>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(card.id);
        }}
        aria-label={`Delete card ${index + 1}`}
        title="Delete card"
        {...tourFieldAttr(
          'flashcards.card-delete',
          'flashcards',
          `row-${index + 1}`
        )}
        className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-sm p-1 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
