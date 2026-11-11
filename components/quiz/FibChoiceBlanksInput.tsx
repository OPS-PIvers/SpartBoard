// Dropdown and Drag blanks (docs/plans/QUIZ_MCA_PRACTICE.md M6, M10); the value is the same blank-joined string a typed FIB writes.
import React from 'react';
import {
  DndContext,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuizPublicQuestion } from '@/types';
import { joinBlanks, splitBlanks } from '@/utils/quizFibBlanks';
import { placementsFromValue } from '@/utils/quizBlankTypes';

const BANK_ID = '__word-bank__';

const badgeCls = (light: boolean) =>
  light ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300';

const focusCls =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary';

const Badge: React.FC<{ n: number; light: boolean }> = ({ n, light }) => (
  <span
    aria-hidden
    className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${badgeCls(light)}`}
  >
    {n}
  </span>
);

interface Props {
  question: QuizPublicQuestion;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  light: boolean;
}

export const FibChoiceBlanksInput: React.FC<Props> = (props) =>
  props.question.blankType === 'dropdown' ? (
    <DropdownBlanks {...props} />
  ) : (
    <DragBlanks {...props} />
  );

const DropdownBlanks: React.FC<Props> = ({
  question,
  value,
  onChange,
  disabled,
  light,
}) => {
  const { t } = useTranslation();
  const lists = question.blankChoices ?? [];
  const parts = splitBlanks(value);
  const many = lists.length > 1;
  const update = (index: number, text: string) =>
    onChange(
      joinBlanks(lists.map((_, i) => (i === index ? text : (parts[i] ?? ''))))
    );
  const selectCls = light
    ? 'bg-white border-slate-300 text-slate-900 focus:border-brand-blue-light'
    : 'bg-slate-800 border-slate-700 text-white focus:border-violet-500';
  return (
    <div className="space-y-3">
      {lists.map((blank, i) => {
        const current = (parts[i] ?? '').trim();
        return (
          <label key={i} className="flex items-center gap-3">
            {many && <Badge n={i + 1} light={light} />}
            <select
              // no-tour-anchor: student quiz screen; tours walk teachers
              aria-label={
                many
                  ? t('quizBlanks.blankN', 'Blank {{n}}', { n: i + 1 })
                  : t('quizBlanks.yourAnswer', 'Your answer')
              }
              value={blank.choices.includes(current) ? current : ''}
              onChange={(e) => update(i, e.target.value)}
              disabled={disabled}
              className={`flex-1 min-w-0 min-h-[52px] px-4 py-3 border-2 rounded-2xl text-sm font-semibold focus:outline-hidden disabled:opacity-50 ${selectCls}`}
            >
              <option value="">{t('quizBlanks.choose', 'Choose…')}</option>
              {blank.choices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
};

/** A word chip: a real button for tap and keyboard, draggable by pointer only. */
const WordChip: React.FC<{
  id: string;
  word: string;
  selected: boolean;
  disabled: boolean;
  light: boolean;
  ariaLabel: string;
  onActivate: () => void;
}> = ({ id, word, selected, disabled, light, ariaLabel, onActivate }) => {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });
  return (
    <button
      // no-tour-anchor: student quiz screen; tours walk teachers
      type="button"
      ref={setNodeRef}
      data-chip={id}
      {...listeners}
      onClick={() => {
        if (!disabled) onActivate();
      }}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border-2 select-none touch-none transition-colors [-webkit-tap-highlight-color:transparent] ${focusCls} ${
        isDragging
          ? 'opacity-40'
          : selected
            ? light
              ? 'bg-brand-blue-primary border-brand-blue-light text-white ring-2 ring-brand-blue-light/40'
              : 'bg-violet-500 border-violet-400 text-white ring-2 ring-violet-300'
            : light
              ? 'bg-white border-slate-300 text-slate-700 hover:border-brand-blue-light/60'
              : 'bg-slate-700 border-slate-600 text-white hover:border-violet-500/60'
      } ${disabled ? 'cursor-default opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
    >
      {word}
    </button>
  );
};

const Slot: React.FC<{
  index: number;
  label: string;
  disabled: boolean;
  light: boolean;
  armed: boolean;
  onTap: () => void;
  children?: React.ReactNode;
}> = ({ index, label, disabled, light, armed, onTap, children }) => {
  const { t } = useTranslation();
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${index}`,
    disabled,
  });
  return (
    <div ref={setNodeRef} className="flex-1 flex">
      {children ?? (
        <button
          // no-tour-anchor: student quiz screen; tours walk teachers
          type="button"
          onClick={() => {
            if (!disabled) onTap();
          }}
          disabled={disabled}
          aria-label={label}
          className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border-2 border-dashed text-left transition-colors ${focusCls} ${
            isOver || armed
              ? light
                ? 'border-brand-blue-light bg-brand-blue-lighter text-brand-blue-primary'
                : 'border-violet-400 bg-violet-500/20 text-white'
              : light
                ? 'border-slate-300 bg-slate-50 text-slate-500'
                : 'border-slate-600 bg-slate-800/40 text-slate-300'
          } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
        >
          {t('quizBlanks.dropHere', 'Drop a word here')}
        </button>
      )}
    </div>
  );
};

const Bank: React.FC<{
  light: boolean;
  children: React.ReactNode;
}> = ({ light, children }) => {
  const { isOver, setNodeRef } = useDroppable({ id: BANK_ID });
  return (
    <div
      ref={setNodeRef}
      className={`p-3 rounded-2xl border-2 border-dashed transition-colors ${
        isOver
          ? light
            ? 'border-brand-blue-light bg-brand-blue-lighter'
            : 'border-violet-400 bg-violet-500/10'
          : light
            ? 'border-slate-300 bg-slate-50'
            : 'border-slate-700 bg-slate-900/40'
      }`}
    >
      {children}
    </div>
  );
};

const DragBlanks: React.FC<Props> = ({
  question,
  value,
  onChange,
  disabled,
  light,
}) => {
  const { t } = useTranslation();
  const bank = question.wordBank ?? [];
  const reuse = question.wordBankReuse === true;
  const count = Math.max(1, question.blankCount ?? 1);
  const many = count > 1;
  const placements = placementsFromValue(value, bank, count, reuse);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  // The tapped chip unmounts, so focus follows the word to where it landed.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const focusNextRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const target = focusNextRef.current;
    if (!target) return;
    const el = rootRef.current?.querySelector<HTMLElement>(
      `[data-chip="${target}"]`
    );
    if (!el) return;
    focusNextRef.current = null;
    el.focus();
  });
  const placedSet = new Set(placements.filter((p): p is number => p !== null));
  const bankShown = bank
    .map((_, i) => i)
    .filter((i) => reuse || !placedSet.has(i));
  const blankName = (slot: number) =>
    many
      ? t('quizBlanks.blankN', 'Blank {{n}}', { n: slot + 1 })
      : t('quizBlanks.theBlank', 'The blank');

  // Pointer only: chips are real buttons, so Enter and Space reach the tap path.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const emit = (next: (number | null)[]) => {
    setPicked(null);
    onChange(joinBlanks(next.map((idx) => (idx === null ? '' : bank[idx]))));
  };
  const place = (word: number, slot: number, fromSlot?: number) => {
    const next = [...placements];
    if (fromSlot !== undefined) next[fromSlot] = next[slot];
    next[slot] = word;
    emit(next);
    setAnnouncement(
      t('quizBlanks.placed', '{{word}} placed in {{blank}}.', {
        word: bank[word],
        blank: blankName(slot),
      })
    );
  };
  const clearSlot = (slot: number) => {
    const word = placements[slot];
    const next = [...placements];
    next[slot] = null;
    emit(next);
    if (word !== null)
      setAnnouncement(
        t('quizBlanks.returned', '{{word}} returned to the word bank.', {
          word: bank[word],
        })
      );
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (disabled || !e.over) return;
    const active = String(e.active.id);
    const over = String(e.over.id);
    if (active.startsWith('word-') && over.startsWith('slot-')) {
      place(Number(active.slice(5)), Number(over.slice(5)));
    } else if (active.startsWith('placed-')) {
      const from = Number(active.slice(7));
      const word = placements[from];
      if (word === null) return;
      if (over === BANK_ID) clearSlot(from);
      else if (over.startsWith('slot-') && Number(over.slice(5)) !== from)
        place(word, Number(over.slice(5)), from);
    }
  };

  const tapWord = (word: number) => {
    const next = picked === word ? null : word;
    setPicked(next);
    setAnnouncement(
      next === null
        ? ''
        : t('quizBlanks.picked', '{{word}} selected. Choose a blank.', {
            word: bank[word],
          })
    );
  };
  // A filled blank takes the selected word, or gives its own word back.
  const tapPlaced = (slot: number) => {
    if (picked !== null) {
      focusNextRef.current = `placed-${slot}`;
      place(picked, slot);
    } else {
      const word = placements[slot];
      if (word !== null) focusNextRef.current = `word-${word}`;
      clearSlot(slot);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragEnd={onDragEnd}
    >
      <div ref={rootRef} className="space-y-4">
        <div className="space-y-2">
          {placements.map((word, slot) => (
            <div key={slot} className="flex items-center gap-3">
              {many && <Badge n={slot + 1} light={light} />}
              <Slot
                index={slot}
                label={t('quizBlanks.emptyBlank', '{{blank}}, empty', {
                  blank: blankName(slot),
                })}
                disabled={disabled}
                light={light}
                armed={picked !== null}
                onTap={() => {
                  if (picked === null) return;
                  focusNextRef.current = `placed-${slot}`;
                  place(picked, slot);
                }}
              >
                {word === null ? undefined : (
                  <WordChip
                    id={`placed-${slot}`}
                    word={bank[word]}
                    selected={false}
                    disabled={disabled}
                    light={light}
                    ariaLabel={t(
                      'quizBlanks.inBlank',
                      '{{word}}, in {{blank}}',
                      { word: bank[word], blank: blankName(slot) }
                    )}
                    onActivate={() => tapPlaced(slot)}
                  />
                )}
              </Slot>
            </div>
          ))}
        </div>
        <Bank light={light}>
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs uppercase tracking-wider font-bold ${light ? 'text-slate-500' : 'text-slate-300'}`}
            >
              {t('quizBlanks.wordBank', 'Word Bank')}
            </span>
            <button
              // no-tour-anchor: student quiz screen; tours walk teachers
              type="button"
              onClick={() => emit(placements.map(() => null))}
              disabled={disabled || placedSet.size === 0}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg transition-colors disabled:opacity-30 ${focusCls} ${light ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
              aria-label={t('quizBlanks.clearAll', 'Clear all blanks')}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              {t('quizBlanks.reset', 'Reset')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[48px]">
            {bankShown.length === 0 && (
              <span
                className={`text-xs italic px-2 py-1 ${light ? 'text-slate-500' : 'text-slate-300'}`}
              >
                {t('quizBlanks.allPlaced', 'All words placed.')}
              </span>
            )}
            {bankShown.map((i) => (
              <WordChip
                key={i}
                id={`word-${i}`}
                word={bank[i]}
                selected={picked === i}
                disabled={disabled}
                light={light}
                ariaLabel={t('quizBlanks.inBank', '{{word}}, in word bank', {
                  word: bank[i],
                })}
                onActivate={() => tapWord(i)}
              />
            ))}
          </div>
        </Bank>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </DndContext>
  );
};
