import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  AlertCircle,
  ChevronDown,
  ClipboardPaste,
  GripVertical,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { FlashcardSet } from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { ImportAttributionLine } from '@/components/import/ImportAttributionLine';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDialog } from '@/context/useDialog';
import { tourTypeAttr } from '@/config/tourAnchors';
import {
  inputClass,
  labelClass,
} from '@/components/widgets/QuizWidget/components/quizEditorFieldStyles';
import { FlashcardLanguageField } from './FlashcardLanguageField';
import { FlashcardSetTargetsField } from './FlashcardSetTargetsField';
import { detectFlashcardLanguage } from './utils/detectFlashcardLanguage';
import { DEFAULT_QUIZ_LANGUAGE } from '@/config/quizReadAloud';
import { PasteImportDrawer } from './PasteImportDrawer';
import { SpeakReviewList } from './speak/SpeakReviewList';
import { SortableCardRow } from './FlashcardEditor';
import type { SpeakLookupCall } from './speak/lookupSpeakReferences';
import {
  MAX_FLASHCARDS_PER_SET,
  cleanFlashcards,
  flashcardSetIncompleteReason,
  useFlashcardEditorState,
} from './useFlashcardEditorState';
import { FlashcardAiOverlay } from './FlashcardAiOverlay';
import { useFlashcardAiDraft } from './useFlashcardAiDraft';

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

const DETECT_DELAY_MS = 800;

const COLUMN_ICON = {
  width: 'min(17px, 4.5cqmin)',
  height: 'min(17px, 4.5cqmin)',
} as const;

/** The Flashcards set editor in Quiz's dialog: inline term and definition rows, saved as you type. */
export const FlashcardSetEditorModal: React.FC<
  FlashcardSetEditorModalProps
> = ({ set, isNew, onPersist, onClose, aiEnabled, speakLookup }) => {
  const { t } = useTranslation();
  const state = useFlashcardEditorState(set, speakLookup);
  const {
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
  // A column the teacher set by hand is never auto-detected again.
  const [pickedLanguage, setPickedLanguage] = useState({
    term: false,
    definition: false,
  });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(addMenuRef, () => setAddMenuOpen(false));
  const termTexts = cards.map((card) => card.term).join('\n');
  const definitionTexts = cards.map((card) => card.definition).join('\n');
  const initialTerms = useMemo(
    () => set.cards.map((card) => card.term).join('\n'),
    [set.cards]
  );
  const initialDefinitions = useMemo(
    () => set.cards.map((card) => card.definition).join('\n'),
    [set.cards]
  );
  // Only a new set, or one still on the default language, is guessed, and only once its words change.
  const detectTerm =
    !pickedLanguage.term &&
    (isNew || set.termLanguage === DEFAULT_QUIZ_LANGUAGE) &&
    termTexts !== initialTerms;
  const detectDefinition =
    !pickedLanguage.definition &&
    (isNew || set.definitionLanguage === DEFAULT_QUIZ_LANGUAGE) &&
    definitionTexts !== initialDefinitions;
  useEffect(() => {
    if (!detectTerm) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void detectFlashcardLanguage(termTexts.split('\n')).then((tag) => {
        if (!cancelled && tag) setTermLanguage(tag);
      });
    }, DETECT_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [detectTerm, termTexts, setTermLanguage]);
  useEffect(() => {
    if (!detectDefinition) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void detectFlashcardLanguage(definitionTexts.split('\n')).then((tag) => {
        if (!cancelled && tag) setDefinitionLanguage(tag);
      });
    }, DETECT_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [detectDefinition, definitionTexts, setDefinitionLanguage]);
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
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const focusCard = (id: string): void => {
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row
        ?.querySelector<HTMLTextAreaElement>('textarea')
        ?.focus({ preventScroll: true });
    });
  };

  const addCardAfter = (index: number): void => {
    const card = insertCardAfter(index);
    if (!card) return;
    focusCard(card.id);
  };

  const jumpToCard = (id: string): void => {
    focusCard(id);
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

  const draftToken = useMemo(
    () => [
      title,
      description,
      targets,
      termLanguage,
      definitionLanguage,
      cards,
      state.speakEdit,
    ],
    [
      title,
      description,
      targets,
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
        <span role="status" className="font-bold text-white">
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

  const listHeader = (
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
                {...tourTypeAttr('flashcards-editor.add-blank', 'flashcards')}
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
  );

  const cardsPane = (
    <div className="space-y-4">
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
      <FlashcardSetTargetsField
        targets={targets}
        onChange={setTargets}
        labelClassName={labelClass}
      />
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
      <div>
        {listHeader}
        <div
          className="grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.25fr)_auto] items-end border border-transparent"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: '0 min(10px, 2.5cqmin) min(6px, 1.5cqmin)',
          }}
        >
          <span
            aria-hidden
            className="invisible"
            style={{ padding: 'min(6px, 1.5cqmin)' }}
          >
            <GripVertical style={COLUMN_ICON} />
          </span>
          <span
            aria-hidden
            className="invisible min-w-[3ch] font-black tabular-nums"
            style={{ fontSize: 'min(12px, 3.8cqmin)' }}
          >
            0
          </span>
          <FlashcardLanguageField
            label="Term language"
            value={termLanguage}
            onChange={(tag) => {
              setPickedLanguage((p) => ({ ...p, term: true }));
              setTermLanguage(tag);
            }}
            tourField="term"
          />
          <FlashcardLanguageField
            label="Definition language"
            value={definitionLanguage}
            onChange={(tag) => {
              setPickedLanguage((p) => ({ ...p, definition: true }));
              setDefinitionLanguage(tag);
            }}
            tourField="definition"
          />
          <span
            aria-hidden
            className="invisible"
            style={{ padding: 'min(6px, 1.5cqmin)' }}
          >
            <Trash2 style={COLUMN_ICON} />
          </span>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={cards.map((card) => card.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-2">
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
      </div>
    </div>
  );

  return (
    <EditorModalShell
      isOpen
      title={title}
      onTitleChange={setTitle}
      titlePlaceholder="Set title"
      tourScope="flashcards"
      subtitle={subtitle}
      isDirty={false}
      onSave={persistDraft}
      autosave={{ draftToken, resetKey: set.id, enabled: checkingCount === 0 }}
      incompleteNotice={hasContent ? incompleteNotice : null}
      onClose={() => void finishAndClose()}
      footerExtras={footerExtras}
      bodyClassName="p-0! overflow-hidden! relative flex flex-col"
      headerAccent={LIBRARY_HEADER_ACCENTS.flashcards}
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto custom-scrollbar bg-slate-50 pb-6"
        // Edits made during the lookup would be overwritten by its result.
        inert={checkingCount > 0}
        style={{ containerType: 'inline-size' }}
      >
        <div className="mx-auto w-full max-w-4xl px-5 pt-4">{cardsPane}</div>
      </div>
      <FlashcardAiOverlay draft={ai} />
      {pasteOpen && (
        <PasteImportDrawer
          onClose={() => setPasteOpen(false)}
          onImport={appendCards}
        />
      )}
    </EditorModalShell>
  );
};
