// Rubric grading: one-tap level bars, expandable criteria with level descriptions.
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  MessageSquarePlus,
  Table2,
  X,
} from 'lucide-react';
import type {
  Rubric,
  RubricCriterion,
  RubricLevel,
  WrittenAnswerRubricScore,
} from '@/types';
import { useRubricLevelOrder } from '@/hooks/useRubricLevelOrder';
import { useRubricGradingPrefs } from '@/hooks/useRubricGradingPrefs';
import {
  orderRubricLevels,
  rubricMaxPoints,
  sumRubricScorePoints,
} from '@/utils/rubricPoints';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { RubricGuideExamples } from '@/components/quiz/RubricGuideExamples';
import { RubricTableModal } from './RubricTableModal';
import { RubricGradingSettings } from './RubricGradingSettings';

export interface RubricScoringPanelProps {
  rubric: Rubric;
  maxPoints: number;
  initialScores?: WrittenAnswerRubricScore[];
  onChange: (scores: WrittenAnswerRubricScore[], derivedPoints: number) => void;
  /** Discreet teacher-facing note (e.g. "Alternate rubric for this student", M17 §5 C4). */
  overrideNote?: string;
  /** Highlights tagged as evidence, per criterion id. Projects passes none. */
  tagCounts?: Record<string, number>;
  /** Cycles the grader through that strand's tagged passages, in text order. */
  onJumpToTagged?: (criterionId: string) => void;
  /** Whether the tagged evidence is text highlights or audio timestamp notes. */
  tagCountKind?: 'highlight' | 'note';
  /** Saves a rubric edited in the full rubric table; without it the table is read-only. */
  onSaveRubric?: (rubric: Rubric) => Promise<void>;
  /** The grader already shows the score, so only the scored count and cap warning remain. */
  hideTotal?: boolean;
}

// Open levels sit side by side once the panel gives each one about 130px.
const LEVEL_GRID: Record<number, string> = {
  2: '@md:grid @md:grid-cols-2 @md:divide-x @md:divide-y-0',
  3: '@xl:grid @xl:grid-cols-3 @xl:divide-x @xl:divide-y-0',
  4: '@2xl:grid @2xl:grid-cols-4 @2xl:divide-x @2xl:divide-y-0',
  5: '@2xl:grid @2xl:grid-cols-5 @2xl:divide-x @2xl:divide-y-0',
  6: '@3xl:grid @3xl:grid-cols-6 @3xl:divide-x @3xl:divide-y-0',
};

// 5 and 6 levels put points above the label so each column keeps ~110px of text.
const LEVEL_CELL: Record<number, string> = {
  5: '@2xl:flex-col @2xl:gap-0.5',
  6: '@3xl:flex-col @3xl:gap-0.5',
};

const ptsLabel = (points: number) => `${points} pt${points === 1 ? '' : 's'}`;

// Which criteria a teacher left open, per rubric, so the next student opens the same way.
const openCriteriaMemory = new Map<string, Set<string>>();

const scrollParentOf = (el: HTMLElement): HTMLElement | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      p.scrollHeight > p.clientHeight
    )
      return p;
  }
  return null;
};

// The next unscored criterion after `fromId`, wrapping to earlier ones.
const nextUnscoredId = (
  criteria: RubricCriterion[],
  scored: (id: string) => boolean,
  fromId: string
): string | undefined => {
  const i = criteria.findIndex((c) => c.id === fromId);
  const rotated = [...criteria.slice(i + 1), ...criteria.slice(0, i)];
  return rotated.find((c) => !scored(c.id))?.id;
};

export const RubricGradingPanel: React.FC<RubricScoringPanelProps> = ({
  rubric,
  maxPoints,
  initialScores,
  onChange,
  overrideNote,
  tagCounts,
  onJumpToTagged,
  tagCountKind = 'highlight',
  onSaveRubric,
  hideTotal = false,
}) => {
  const { t } = useTranslation();
  const [order, switchOrder] = useRubricLevelOrder();
  const prefs = useRubricGradingPrefs();
  const [scores, setScores] = useState<WrittenAnswerRubricScore[]>(
    () => initialScores ?? []
  );
  const [openCriteria, setOpenCriteria] = useState<Set<string>>(() => {
    if (prefs.autoAdvance && prefs.openNext) {
      const scored = new Set((initialScores ?? []).map((s) => s.criterionId));
      const first = rubric.criteria.find((c) => !scored.has(c.id));
      return new Set(first ? [first.id] : []);
    }
    return new Set(openCriteriaMemory.get(rubric.id) ?? []);
  });
  const criterionRefs = useRef(new Map<string, HTMLFieldSetElement>());
  const pendingScroll = useRef<{ id: string; top: number } | null>(null);
  const [scrollTick, setScrollTick] = useState(0);

  // After auto-advance, put the next criterion where the scored one was, under the pointer.
  useLayoutEffect(() => {
    const pending = pendingScroll.current;
    pendingScroll.current = null;
    const el = pending && criterionRefs.current.get(pending.id);
    if (!pending || !el) return;
    const delta = el.getBoundingClientRect().top - pending.top;
    if (Math.abs(delta) < 1) return;
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')
      .matches
      ? 'auto'
      : 'smooth';
    const scroller = scrollParentOf(el);
    if (scroller) scroller.scrollBy({ top: delta, behavior });
    else window.scrollBy({ top: delta, behavior });
  }, [scrollTick]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(
    () =>
      new Set(
        (initialScores ?? []).filter((s) => s.note).map((s) => s.criterionId)
      )
  );
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const s of initialScores ?? [])
      if (s.note) seed[s.criterionId] = s.note;
    return seed;
  });
  const [tableOpen, setTableOpen] = useState(false);

  const byCriterion = useMemo(() => {
    const m = new Map<string, WrittenAnswerRubricScore>();
    for (const s of scores) m.set(s.criterionId, s);
    return m;
  }, [scores]);

  // Keep the emitted list in rubric order so saved payloads stay stable.
  const commit = useCallback(
    (next: Map<string, WrittenAnswerRubricScore>) => {
      const ordered = rubric.criteria
        .map((c) => next.get(c.id))
        .filter((s): s is WrittenAnswerRubricScore => !!s);
      setScores(ordered);
      onChange(ordered, sumRubricScorePoints(ordered));
    },
    [rubric.criteria, onChange]
  );

  const noteFor = (criterionId: string) =>
    (
      noteDrafts[criterionId] ??
      byCriterion.get(criterionId)?.note ??
      ''
    ).trim();

  const advanceFrom = (
    criterion: RubricCriterion,
    next: Map<string, WrittenAnswerRubricScore>
  ) => {
    const nextId = nextUnscoredId(
      rubric.criteria,
      (id) => next.has(id),
      criterion.id
    );
    if (prefs.openNext) {
      setOpenCriteria((prev) => {
        const open = new Set(prev);
        open.delete(criterion.id);
        if (nextId) open.add(nextId);
        openCriteriaMemory.set(rubric.id, open);
        return open;
      });
    }
    const el = criterionRefs.current.get(criterion.id);
    if (!nextId || !el) return;
    pendingScroll.current = { id: nextId, top: el.getBoundingClientRect().top };
    setScrollTick((n) => n + 1);
  };

  const tapLevel = (criterion: RubricCriterion, level: RubricLevel) => {
    const next = new Map(byCriterion);
    const wasScored = next.has(criterion.id);
    if (next.get(criterion.id)?.levelId === level.id) {
      next.delete(criterion.id);
    } else {
      const note = noteFor(criterion.id);
      next.set(criterion.id, {
        criterionId: criterion.id,
        levelId: level.id,
        points: level.points,
        ...(note ? { note } : {}),
      });
    }
    commit(next);
    if (prefs.autoAdvance && !wasScored && next.has(criterion.id))
      advanceFrom(criterion, next);
  };

  const setNote = (criterionId: string, note: string) => {
    setNoteDrafts((prev) => ({ ...prev, [criterionId]: note }));
    const existing = byCriterion.get(criterionId);
    if (!existing) return;
    const next = new Map(byCriterion);
    const trimmed = note.trim();
    next.set(criterionId, {
      criterionId: existing.criterionId,
      levelId: existing.levelId,
      points: existing.points,
      ...(trimmed ? { note: trimmed } : {}),
    });
    commit(next);
  };

  const toggleSet = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
    remember?: string
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (remember) openCriteriaMemory.set(remember, next);
      return next;
    });

  const rubricMax = useMemo(() => rubricMaxPoints(rubric), [rubric]);
  const derivedPoints = sumRubricScorePoints(scores);
  const scoredCount = rubric.criteria.filter((c) =>
    byCriterion.has(c.id)
  ).length;
  const allScored =
    rubric.criteria.length > 0 && scoredCount === rubric.criteria.length;
  const allOpen =
    rubric.criteria.length > 0 &&
    rubric.criteria.every((c) => openCriteria.has(c.id));
  const openFirstUnscored = () => {
    const first = rubric.criteria.find((c) => !byCriterion.has(c.id));
    if (!first) return;
    setOpenCriteria((prev) => {
      const open = new Set(prev).add(first.id);
      openCriteriaMemory.set(rubric.id, open);
      return open;
    });
  };
  const toggleAll = () => {
    const next = new Set(allOpen ? [] : rubric.criteria.map((c) => c.id));
    openCriteriaMemory.set(rubric.id, next);
    setOpenCriteria(next);
  };

  return (
    <section
      aria-label="Rubric scoring"
      className="flex flex-col [container-type:inline-size]"
    >
      <header className="pb-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleAll}
            {...tourTypeAttr('quiz-grading.rubric-expand-all', 'quiz')}
            aria-label={
              allOpen ? 'Collapse all criteria' : 'Expand all criteria'
            }
            title={allOpen ? 'Collapse all' : 'Expand all'}
            className="touch-target-expand flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
          >
            {allOpen ? (
              <ChevronsDownUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronsUpDown className="h-4 w-4" aria-hidden />
            )}
          </button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-1 gap-y-1">
            <button
              type="button"
              onClick={() => setTableOpen(true)}
              {...tourTypeAttr('quiz-grading.rubric-view-full', 'quiz')}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-brand-blue-primary transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
            >
              <Table2 className="h-4 w-4" aria-hidden />
              View rubric
            </button>
          </div>
          <RubricGradingSettings
            order={order}
            onOrderChange={(o) => {
              if (o !== order) switchOrder();
            }}
            autoAdvance={prefs.autoAdvance}
            onAutoAdvanceChange={(on) => {
              prefs.setAutoAdvance(on);
              if (on && prefs.openNext) openFirstUnscored();
            }}
            openNext={prefs.openNext}
            onOpenNextChange={(on) => {
              prefs.setOpenNext(on);
              if (on) openFirstUnscored();
            }}
          />
        </div>
        {overrideNote && (
          <p className="mt-1 text-xs italic text-slate-600">{overrideNote}</p>
        )}
      </header>

      <div className="flex flex-col divide-y divide-slate-200 border-y border-slate-200">
        {rubric.criteria.map((criterion) => {
          const selected = byCriterion.get(criterion.id);
          const isOpen = openCriteria.has(criterion.id);
          const noteOpen = expandedNotes.has(criterion.id);
          const levels = orderRubricLevels(criterion.levels, order);
          const levelGrid = LEVEL_GRID[levels.length] ?? '';
          const levelCell = LEVEL_CELL[levels.length] ?? '';
          const nameId = `rubric-${rubric.id}-${criterion.id}-name`;
          const tagCount = tagCounts?.[criterion.id] ?? 0;
          const countLabel = t(
            tagCountKind === 'note'
              ? 'quizMediaResponse.grading.rubricTags.noteCount'
              : 'quizMediaResponse.grading.rubricTags.highlightCount',
            { count: tagCount }
          );
          return (
            <fieldset
              key={criterion.id}
              ref={(el) => {
                if (el) criterionRefs.current.set(criterion.id, el);
                else criterionRefs.current.delete(criterion.id);
              }}
              aria-labelledby={nameId}
              className="py-2"
            >
              <div className="flex items-start gap-1">
                <button
                  type="button"
                  onClick={() =>
                    toggleSet(setOpenCriteria, criterion.id, rubric.id)
                  }
                  aria-expanded={isOpen}
                  {...tourFieldAttr(
                    'quiz-grading.rubric-criterion-toggle',
                    'quiz',
                    criterion.id
                  )}
                  className="group -ml-1 flex min-w-0 flex-1 items-start gap-1 rounded-md py-1.5 pl-0.5 pr-1 text-left focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
                >
                  <ChevronRight
                    aria-hidden
                    className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                      isOpen ? 'rotate-90' : ''
                    }`}
                  />
                  <span
                    id={nameId}
                    className="block min-w-0 break-words text-sm font-semibold leading-snug text-slate-800 transition-colors group-hover:text-brand-blue-primary"
                  >
                    {criterion.name}
                  </span>
                </button>
                {(noteOpen || selected !== undefined) && (
                  <button
                    type="button"
                    onClick={() => toggleSet(setExpandedNotes, criterion.id)}
                    {...tourFieldAttr(
                      'quiz-grading.rubric-note-toggle',
                      'quiz',
                      criterion.id
                    )}
                    aria-expanded={noteOpen}
                    aria-label={`${noteOpen ? 'Hide' : 'Add'} note for ${criterion.name}`}
                    title={`${noteOpen ? 'Hide' : 'Add'} note`}
                    className="touch-target-expand flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
                  >
                    {noteOpen ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <MessageSquarePlus className="h-4 w-4" />
                    )}
                  </button>
                )}
                {selected && (
                  <span className="shrink-0 py-1.5 pl-1 text-sm font-bold tabular-nums text-brand-blue-primary">
                    {selected.points}
                  </span>
                )}
              </div>

              {isOpen && criterion.description && (
                <p className="ml-5 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                  {criterion.description}
                </p>
              )}

              {tagCount > 0 && onJumpToTagged && (
                <button
                  type="button"
                  onClick={() => onJumpToTagged(criterion.id)}
                  {...tourFieldAttr(
                    'quiz-grading.rubric-jump-tagged',
                    'quiz',
                    criterion.id
                  )}
                  aria-label={`${countLabel}${t(
                    'quizMediaResponse.grading.rubricTags.jumpToSuffix',
                    { name: criterion.name }
                  )}`}
                  className="ml-5 mt-0.5 rounded-sm text-xs font-bold text-brand-blue-primary underline underline-offset-2 transition-colors hover:text-brand-blue-dark focus-visible:outline-2 focus-visible:outline-offset-1"
                >
                  {countLabel}
                </button>
              )}

              {isOpen && criterion.guide && (
                <div className="ml-5">
                  <RubricGuideExamples
                    examples={criterion.guide.examples ?? []}
                  />
                </div>
              )}

              {isOpen ? (
                <div
                  className={`ml-5 mt-2 flex flex-col divide-y divide-slate-200 border-y border-slate-200 ${levelGrid}`}
                >
                  {levels.map((level) => {
                    const isSelected = selected?.levelId === level.id;
                    return (
                      <button
                        key={level.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => tapLevel(criterion, level)}
                        {...tourFieldAttr(
                          'quiz-grading.rubric-level',
                          'quiz',
                          `${criterion.id}-${level.id}`
                        )}
                        className={`flex w-full gap-2 px-2 py-2 text-left transition-colors ${levelCell} [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue-primary ${
                          isSelected
                            ? 'bg-brand-blue-primary text-white'
                            : 'text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <span className="w-6 shrink-0 text-sm font-bold tabular-nums">
                          {level.points}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold">
                            {level.label}
                          </span>
                          {level.description && (
                            <span
                              className={`mt-0.5 block whitespace-pre-line break-words text-xs leading-relaxed ${
                                isSelected ? 'text-white/85' : 'text-slate-600'
                              }`}
                            >
                              {level.description}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ml-5 mt-2 flex gap-1">
                  {levels.map((level) => {
                    const isSelected = selected?.levelId === level.id;
                    return (
                      <button
                        key={level.id}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`${level.label}, ${ptsLabel(level.points)}`}
                        title={`${level.label}, ${ptsLabel(level.points)}`}
                        onClick={() => tapLevel(criterion, level)}
                        {...tourFieldAttr(
                          'quiz-grading.rubric-level',
                          'quiz',
                          `${criterion.id}-${level.id}`
                        )}
                        className={`h-7 min-w-0 flex-1 rounded-sm text-sm font-bold tabular-nums transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-primary ${
                          isSelected
                            ? 'bg-brand-blue-primary text-white'
                            : 'bg-slate-200 hover:bg-slate-300'
                        }`}
                      >
                        {isSelected ? level.points : null}
                      </button>
                    );
                  })}
                </div>
              )}

              {noteOpen && (
                <textarea
                  aria-label={`Note for ${criterion.name}`}
                  {...tourFieldAttr(
                    'quiz-grading.rubric-note',
                    'quiz',
                    criterion.id
                  )}
                  value={noteDrafts[criterion.id] ?? selected?.note ?? ''}
                  onChange={(e) => setNote(criterion.id, e.target.value)}
                  rows={2}
                  placeholder="Note for this criterion…"
                  className="ml-5 mt-2 w-[calc(100%-1.25rem)] resize-none rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
                />
              )}
            </fieldset>
          );
        })}
      </div>

      <footer className={hideTotal ? 'pt-1.5' : 'pt-3'}>
        {!hideTotal && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Rubric total
            </span>
            <span className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">
              {derivedPoints} / {rubricMax}
            </span>
          </div>
        )}
        {!allScored && (
          <p className="mt-1 text-xs font-semibold text-amber-700">
            {scoredCount} of {rubric.criteria.length} criteria scored
          </p>
        )}
        {allScored && derivedPoints > maxPoints && (
          <p className="mt-1 text-xs font-semibold text-amber-700">
            {`Points capped at ${maxPoints}`}
          </p>
        )}
      </footer>

      {tableOpen && (
        <RubricTableModal
          rubric={rubric}
          order={order}
          onOrderChange={switchOrder}
          scores={byCriterion}
          onSave={onSaveRubric}
          editLevels
          onClose={() => setTableOpen(false)}
        />
      )}
    </section>
  );
};

export default RubricGradingPanel;
