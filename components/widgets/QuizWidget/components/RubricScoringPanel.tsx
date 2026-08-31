/**
 * RubricScoringPanel — the grader right-rail insert rendered when a written
 * question carries a `rubricSnapshot`. Selections are local to the panel;
 * `onChange` hands the parent the score list plus the derived point total on
 * every edit. Remount (via `key`) to re-seed from a different saved grade.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { Rubric, RubricCriterion, RubricLevel } from '@/types';
import type { WrittenAnswerRubricScore } from '@/types';
import { rubricMaxPoints, sumRubricScorePoints } from '@/utils/rubricPoints';

interface RubricScoringPanelProps {
  rubric: Rubric;
  maxPoints: number;
  initialScores?: WrittenAnswerRubricScore[];
  onChange: (scores: WrittenAnswerRubricScore[], derivedPoints: number) => void;
  /** Discreet teacher-facing note (e.g. "Alternate rubric for this student", M17 §5 C4). */
  overrideNote?: string;
}

export const RubricScoringPanel: React.FC<RubricScoringPanelProps> = ({
  rubric,
  maxPoints,
  initialScores,
  onChange,
  overrideNote,
}) => {
  const [scores, setScores] = useState<WrittenAnswerRubricScore[]>(
    () => initialScores ?? []
  );
  // Notes start expanded for criteria that already carry one so a saved
  // note is never hidden behind a toggle the teacher has to discover.
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(
    () =>
      new Set(
        (initialScores ?? []).filter((s) => s.note).map((s) => s.criterionId)
      )
  );
  // Raw note text per criterion; trimmed only on commit so whitespace survives.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const s of initialScores ?? [])
      if (s.note) seed[s.criterionId] = s.note;
    return seed;
  });

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

  const selectLevel = useCallback(
    (criterion: RubricCriterion, level: RubricLevel) => {
      const next = new Map(byCriterion);
      const prev = next.get(criterion.id);
      next.set(criterion.id, {
        criterionId: criterion.id,
        levelId: level.id,
        points: level.points,
        ...(prev?.note ? { note: prev.note } : {}),
      });
      commit(next);
    },
    [byCriterion, commit]
  );

  const setNote = useCallback(
    (criterionId: string, note: string) => {
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
    },
    [byCriterion, commit]
  );

  const toggleNote = useCallback((criterionId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(criterionId)) next.delete(criterionId);
      else next.add(criterionId);
      return next;
    });
  }, []);

  const rubricMax = useMemo(() => rubricMaxPoints(rubric), [rubric]);

  const derivedPoints = sumRubricScorePoints(scores);
  const scoredCount = rubric.criteria.filter((c) =>
    byCriterion.has(c.id)
  ).length;
  const allScored =
    rubric.criteria.length > 0 && scoredCount === rubric.criteria.length;

  return (
    <section
      aria-label="Rubric scoring"
      className="rounded-lg border border-slate-200 bg-slate-50/70"
    >
      <header className="px-3 py-2.5 border-b border-slate-200">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Rubric
        </h4>
        <p className="text-sm font-semibold text-slate-900 leading-snug mt-0.5">
          {rubric.title}
        </p>
        {rubric.description && (
          <p className="text-xs text-slate-600 leading-relaxed mt-1">
            {rubric.description}
          </p>
        )}
        {overrideNote && (
          <p className="text-xs text-slate-600 italic mt-1">{overrideNote}</p>
        )}
      </header>

      <div className="flex flex-col divide-y divide-slate-200">
        {rubric.criteria.map((criterion) => {
          const selected = byCriterion.get(criterion.id);
          const noteOpen = expandedNotes.has(criterion.id);
          // Storage orders levels low → high; the grader scans high → low.
          const levels = [...criterion.levels].reverse();
          return (
            <fieldset key={criterion.id} className="relative px-3 py-3">
              <legend className="w-full pr-8 mb-2">
                <span className="block text-sm font-bold text-slate-900 leading-snug">
                  {criterion.name}
                </span>
                {criterion.description && (
                  <span className="block text-xs text-slate-600 leading-relaxed mt-0.5">
                    {criterion.description}
                  </span>
                )}
              </legend>
              {selected && (
                <button
                  type="button"
                  onClick={() => toggleNote(criterion.id)}
                  aria-expanded={noteOpen}
                  aria-label={`${noteOpen ? 'Hide' : 'Add'} note for ${criterion.name}`}
                  title={`${noteOpen ? 'Hide' : 'Add'} note`}
                  className="absolute top-3 right-3 p-1 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                >
                  {noteOpen ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <MessageSquarePlus className="w-4 h-4" />
                  )}
                </button>
              )}

              <div className="flex flex-col gap-1.5">
                {levels.map((level) => {
                  const isSelected = selected?.levelId === level.id;
                  return (
                    <label
                      key={level.id}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`rubric-${rubric.id}-${criterion.id}`}
                        value={level.id}
                        checked={isSelected}
                        onChange={() => selectLevel(criterion, level)}
                        className="mt-0.5 accent-emerald-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {level.label}
                          </span>
                          <span className="text-xs font-mono text-slate-600 shrink-0">
                            {level.points} pt{level.points === 1 ? '' : 's'}
                          </span>
                        </span>
                        {level.description && (
                          <span className="block text-xs text-slate-600 leading-relaxed mt-0.5">
                            {level.description}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>

              {selected && noteOpen && (
                <textarea
                  aria-label={`Note for ${criterion.name}`}
                  value={noteDrafts[criterion.id] ?? selected.note ?? ''}
                  onChange={(e) => setNote(criterion.id, e.target.value)}
                  rows={2}
                  placeholder="Note for this criterion…"
                  className="mt-2 w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary text-xs resize-none"
                />
              )}
            </fieldset>
          );
        })}
      </div>

      <footer className="px-3 py-2.5 border-t border-slate-200 bg-white rounded-b-lg">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Rubric total
          </span>
          <span className="font-mono text-sm font-bold text-slate-900">
            {derivedPoints} / {rubricMax}
          </span>
        </div>
        {!allScored && (
          <p className="text-xs text-amber-700 font-semibold mt-1">
            {scoredCount} of {rubric.criteria.length} criteria scored — this
            response stays awaiting a grade until all are selected.
          </p>
        )}
        {allScored && derivedPoints > maxPoints && (
          <p className="text-xs text-amber-700 font-semibold mt-1">
            {`Rubric total exceeds the question max — points capped at ${maxPoints}.`}
          </p>
        )}
      </footer>
    </section>
  );
};

export default RubricScoringPanel;
