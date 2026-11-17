// Rubric grading (rubric-grading-v2): one-tap level buttons, expandable criteria, per-criterion score override.
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ChevronRight,
  MessageSquarePlus,
  Table2,
  X,
} from 'lucide-react';
import type {
  Rubric,
  RubricCriterion,
  RubricLevel,
  RubricLevelOrder,
  WrittenAnswerRubricScore,
} from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import {
  criterionMaxPoints,
  orderRubricLevels,
  rubricMaxPoints,
  sumRubricScorePoints,
} from '@/utils/rubricPoints';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { RubricGuideExamples } from '@/components/quiz/RubricGuideExamples';
import { RubricTableModal } from './RubricTableModal';

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
}

const ptsLabel = (points: number) => `${points} pt${points === 1 ? '' : 's'}`;

// Which criteria a teacher left open, per rubric, so the next student opens the same way.
const openCriteriaMemory = new Map<string, Set<string>>();

export const RubricGradingPanel: React.FC<RubricScoringPanelProps> = ({
  rubric,
  maxPoints,
  initialScores,
  onChange,
  overrideNote,
  tagCounts,
  onJumpToTagged,
  tagCountKind = 'highlight',
}) => {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const [localOrder, setLocalOrder] = useState<RubricLevelOrder>('high-first');
  const order = auth?.rubricLevelOrder ?? localOrder;
  const [scores, setScores] = useState<WrittenAnswerRubricScore[]>(
    () => initialScores ?? []
  );
  const [openCriteria, setOpenCriteria] = useState<Set<string>>(
    () => new Set(openCriteriaMemory.get(rubric.id) ?? [])
  );
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
  // Raw score-box text while the teacher types; absent means show the saved points.
  const [pointDrafts, setPointDrafts] = useState<Record<string, string>>({});
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

  const clearPointDraft = (criterionId: string) =>
    setPointDrafts((prev) => {
      if (!(criterionId in prev)) return prev;
      const next = { ...prev };
      delete next[criterionId];
      return next;
    });

  const tapLevel = (criterion: RubricCriterion, level: RubricLevel) => {
    const next = new Map(byCriterion);
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
    clearPointDraft(criterion.id);
    commit(next);
  };

  const typePoints = (criterion: RubricCriterion, raw: string) => {
    setPointDrafts((prev) => ({ ...prev, [criterion.id]: raw }));
    const existing = byCriterion.get(criterion.id);
    const next = new Map(byCriterion);
    const note = noteFor(criterion.id);
    const withNote = note ? { note } : {};
    if (raw.trim() === '') {
      const level = criterion.levels.find((l) => l.id === existing?.levelId);
      if (level) {
        next.set(criterion.id, {
          criterionId: criterion.id,
          levelId: level.id,
          points: level.points,
          ...withNote,
        });
      } else {
        next.delete(criterion.id);
      }
      commit(next);
      return;
    }
    const value = Number(raw);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > criterionMaxPoints(criterion)
    )
      return;
    // A typed score that matches a level picks that level; any other keeps the current one.
    const match = criterion.levels.find((l) => l.points === value);
    next.set(criterion.id, {
      criterionId: criterion.id,
      levelId: match?.id ?? existing?.levelId ?? '',
      points: value,
      ...withNote,
    });
    commit(next);
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

  const switchOrder = () => {
    const next: RubricLevelOrder =
      order === 'high-first' ? 'low-first' : 'high-first';
    if (auth) {
      auth.updateAccountPreferences({ rubricLevelOrder: next }).catch(() => {
        // Saved locally for this session even if the profile write fails.
      });
    } else {
      setLocalOrder(next);
    }
  };

  const rubricMax = useMemo(() => rubricMaxPoints(rubric), [rubric]);
  const derivedPoints = sumRubricScorePoints(scores);
  const scoredCount = rubric.criteria.filter((c) =>
    byCriterion.has(c.id)
  ).length;
  const allScored =
    rubric.criteria.length > 0 && scoredCount === rubric.criteria.length;
  const orderLabel = order === 'high-first' ? 'Highest first' : 'Lowest first';

  return (
    <section aria-label="Rubric scoring" className="flex flex-col">
      <header className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Rubric
          </h4>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={switchOrder}
              {...tourTypeAttr('quiz-grading.rubric-order', 'quiz')}
              aria-label={`Level order: ${orderLabel}. Switch to ${
                order === 'high-first' ? 'lowest' : 'highest'
              } first`}
              title={`Switch to ${order === 'high-first' ? 'lowest' : 'highest'} first`}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
              {orderLabel}
            </button>
            <button
              type="button"
              onClick={() => setTableOpen(true)}
              {...tourTypeAttr('quiz-grading.rubric-view-full', 'quiz')}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-brand-blue-primary transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden />
              View rubric
            </button>
          </div>
        </div>
        <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
          {rubric.title}
        </p>
        {rubric.description && (
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {rubric.description}
          </p>
        )}
        {overrideNote && (
          <p className="mt-1 text-xs italic text-slate-600">{overrideNote}</p>
        )}
      </header>

      <div className="flex flex-col divide-y divide-slate-200 border-y border-slate-200">
        {rubric.criteria.map((criterion) => {
          const selected = byCriterion.get(criterion.id);
          const selectedLevel = criterion.levels.find(
            (l) => l.id === selected?.levelId
          );
          const isOpen = openCriteria.has(criterion.id);
          const noteOpen = expandedNotes.has(criterion.id);
          const max = criterionMaxPoints(criterion);
          const levels = orderRubricLevels(criterion.levels, order);
          const nameId = `rubric-${rubric.id}-${criterion.id}-name`;
          const draft = pointDrafts[criterion.id];
          const boxValue = draft ?? (selected ? String(selected.points) : '');
          const draftNum = draft === undefined ? NaN : Number(draft);
          const boxInvalid =
            draft !== undefined &&
            draft.trim() !== '' &&
            !(Number.isFinite(draftNum) && draftNum >= 0 && draftNum <= max);
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
              aria-labelledby={nameId}
              className="py-3"
            >
              <div className="flex items-start gap-2">
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
                  className="-ml-1 flex min-w-0 flex-1 items-start gap-1 rounded-md py-1 pl-0.5 pr-1 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
                >
                  <ChevronRight
                    aria-hidden
                    className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                      isOpen ? 'rotate-90' : ''
                    }`}
                  />
                  <span className="min-w-0">
                    <span
                      id={nameId}
                      className="block break-words text-sm font-bold leading-snug text-slate-900"
                    >
                      {criterion.name}
                    </span>
                    {!isOpen && selectedLevel && (
                      <span className="block text-xs text-slate-600">
                        {selectedLevel.label}
                      </span>
                    )}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={max}
                    step="any"
                    value={boxValue}
                    onChange={(e) => typePoints(criterion, e.target.value)}
                    onBlur={() => clearPointDraft(criterion.id)}
                    aria-label={`Score for ${criterion.name}`}
                    aria-invalid={boxInvalid || undefined}
                    {...tourFieldAttr(
                      'quiz-grading.rubric-criterion-score',
                      'quiz',
                      criterion.id
                    )}
                    className="w-14 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-slate-900 focus:border-brand-blue-primary focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30 aria-[invalid]:border-brand-red-primary/60"
                  />
                  <span className="whitespace-nowrap text-sm tabular-nums text-slate-500">
                    / {max}
                  </span>
                </div>
                {selected && (
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
                    className="touch-target-expand mt-0.5 shrink-0 rounded-sm p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  >
                    {noteOpen ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <MessageSquarePlus className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>

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

              {isOpen ? (
                <>
                  {criterion.description && (
                    <p className="mt-1 whitespace-pre-line pl-5 text-xs leading-relaxed text-slate-600">
                      {criterion.description}
                    </p>
                  )}
                  {criterion.guide && (
                    <div className="pl-5">
                      <RubricGuideExamples
                        examples={criterion.guide.examples ?? []}
                      />
                    </div>
                  )}
                  <div className="mt-2 flex flex-col divide-y divide-slate-200 border-t border-slate-200">
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
                          className={`block w-full px-2.5 py-2 text-left transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue-primary ${
                            isSelected
                              ? 'bg-brand-blue-primary text-white'
                              : 'text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold">
                              {level.label}
                            </span>
                            <span
                              className={`shrink-0 text-sm font-bold tabular-nums ${
                                isSelected ? 'text-white' : 'text-slate-700'
                              }`}
                            >
                              {ptsLabel(level.points)}
                            </span>
                          </span>
                          {level.description && (
                            <span
                              className={`mt-0.5 block whitespace-pre-line text-xs leading-relaxed ${
                                isSelected ? 'text-white' : 'text-slate-600'
                              }`}
                            >
                              {level.description}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div
                  className="mt-2 grid gap-1.5"
                  style={{
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(2.75rem, 1fr))',
                  }}
                >
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
                        className={`h-10 rounded-md border text-base font-bold tabular-nums transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-primary ${
                          isSelected
                            ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                            : 'border-slate-300 bg-white text-brand-blue-primary hover:bg-slate-100'
                        }`}
                      >
                        {level.points}
                      </button>
                    );
                  })}
                </div>
              )}

              {selected && noteOpen && (
                <textarea
                  aria-label={`Note for ${criterion.name}`}
                  {...tourFieldAttr(
                    'quiz-grading.rubric-note',
                    'quiz',
                    criterion.id
                  )}
                  value={noteDrafts[criterion.id] ?? selected.note ?? ''}
                  onChange={(e) => setNote(criterion.id, e.target.value)}
                  rows={2}
                  placeholder="Note for this criterion…"
                  className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
                />
              )}
            </fieldset>
          );
        })}
      </div>

      <footer className="pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Rubric total
          </span>
          <span className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">
            {derivedPoints} / {rubricMax}
          </span>
        </div>
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
          scores={byCriterion}
          onClose={() => setTableOpen(false)}
        />
      )}
    </section>
  );
};

export default RubricGradingPanel;
