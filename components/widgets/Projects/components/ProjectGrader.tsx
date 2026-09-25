/**
 * ProjectGrader — the group grading queue.
 *
 * D22, now in the quiz free-response grader's chrome: the same
 * `EditorModalShell`, left queue rail, prev/skip/save-and-next footer and
 * autosave-on-advance, with the queue walking groups instead of students.
 * Mirrored rather than extracted (A6) — the quiz grading path is untouched.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Send,
} from 'lucide-react';
import type {
  ProjectGroup,
  ProjectGroupGrade,
  ProjectRun,
  WrittenAnswerRubricScore,
} from '@/types';
import {
  formatStudentName,
  useAssignmentPseudonymsMulti,
} from '@/hooks/useAssignmentPseudonyms';
import { useProjectGrades } from '@/hooks/useProjectGrades';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { RubricScoringPanel } from '@/components/widgets/QuizWidget/components/RubricScoringPanel';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import { clampPoints } from '@/utils/gradeDraft';
import { Toggle } from '@/components/common/Toggle';

/** The editable half of a grade; everything else is derived on save. */
interface GradeDraft {
  rubricScores: WrittenAnswerRubricScore[];
  points: number;
  comment: string;
  released: boolean;
  overridesByUid: Record<string, { points: number; note?: string }>;
}

const draftFrom = (grade: ProjectGroupGrade | undefined): GradeDraft => ({
  rubricScores: grade?.rubricScores ?? [],
  points: grade?.points ?? 0,
  comment: grade?.comment ?? '',
  released: grade?.released ?? false,
  overridesByUid: grade?.overridesByUid ?? {},
});

const sameDraft = (a: GradeDraft, b: GradeDraft): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const stepperButton =
  'shrink-0 rounded-lg border border-slate-300 p-1 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent';

interface ProjectGraderProps {
  run: ProjectRun;
  groups: ProjectGroup[];
  orgId: string | null | undefined;
  onClose: () => void;
}

export const ProjectGrader: React.FC<ProjectGraderProps> = ({
  run,
  groups,
  orgId,
  onClose,
}) => {
  const { gradesByGroupId, loading, saveGrade } = useProjectGrades(run.id);
  // The same HMAC pseudonyms `commitProjectGroupsV1` minted, so a member uid
  // resolves to a real name here without any project-specific backend.
  const { byStudentUid } = useAssignmentPseudonymsMulti(
    run.id,
    run.classIds,
    orgId
  );

  const ordered = useMemo(
    () =>
      [...groups].sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name)
      ),
    [groups]
  );

  const [index, setIndex] = useState(0);
  const group = ordered[Math.min(index, Math.max(ordered.length - 1, 0))];
  const saved = group ? gradesByGroupId[group.id] : undefined;

  const [draft, setDraft] = useState<GradeDraft>(() => draftFrom(saved));
  const [savingError, setSavingError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed while rendering when the queue moves or a save lands, rather than
  // in an effect: an effect would paint the previous group's score first.
  const [hydrationKey, setHydrationKey] = useState('');
  const nextKey = `${group?.id ?? ''}:${saved?.gradedAt ?? 0}`;
  if (hydrationKey !== nextKey) {
    setHydrationKey(nextKey);
    setDraft(draftFrom(saved));
  }

  const maxPoints = run.rubric
    ? (run.rubricMaxPoints ?? rubricMaxPoints(run.rubric))
    : 0;
  const dirty = !sameDraft(draft, draftFrom(saved));
  const gradedCount = ordered.filter((g) => gradesByGroupId[g.id]).length;
  const allGraded = ordered.length > 0 && gradedCount === ordered.length;

  const persist = useCallback(
    async (target: ProjectGroup, next: GradeDraft) => {
      const grade: ProjectGroupGrade = {
        groupId: target.id,
        rubricScores: next.rubricScores,
        points: next.points,
        maxPoints,
        released: next.released,
        gradedAt: Date.now(),
        ...(next.comment.trim() ? { comment: next.comment.trim() } : {}),
        ...(Object.keys(next.overridesByUid).length > 0
          ? { overridesByUid: next.overridesByUid }
          : {}),
      };
      await saveGrade(grade);
    },
    [maxPoints, saveGrade]
  );

  /** Autosave on advance: moving on is the commit, as in the quiz grader. */
  const move = async (delta: number) => {
    if (busy || !group) return;
    const target = Math.min(Math.max(index + delta, 0), ordered.length - 1);
    if (target === index) return;
    if (dirty) {
      setBusy(true);
      try {
        await persist(group, draft);
        setSavingError(null);
      } catch {
        setSavingError('That score could not be saved.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setIndex(target);
  };

  /** Skip leaves the draft unsaved on purpose — "come back to this one". */
  const skip = (delta: number) => {
    if (busy) return;
    setIndex((current) =>
      Math.min(Math.max(current + delta, 0), ordered.length - 1)
    );
  };

  const saveNow = async () => {
    if (!group || busy) return;
    setBusy(true);
    try {
      await persist(group, draft);
      setSavingError(null);
    } catch {
      setSavingError('That score could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const setOverride = (
    uid: string,
    patch: { points?: string; note?: string }
  ) => {
    setDraft((current) => {
      const next = { ...current.overridesByUid };
      const existing = next[uid];
      if (patch.points !== undefined) {
        const trimmed = patch.points.trim();
        if (trimmed === '') {
          // Clearing the points clears the whole row: a note with no score is
          // not an override, and would publish nothing the student can read.
          delete next[uid];
          return { ...current, overridesByUid: next };
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) return current;
        // The number input's min/max only affect its spinner, not typed text.
        next[uid] = { ...existing, points: clampPoints(parsed, maxPoints) };
      }
      if (patch.note !== undefined && next[uid]) {
        const note = patch.note;
        next[uid] = note.trim()
          ? { ...next[uid], note }
          : { points: next[uid].points };
      }
      return { ...current, overridesByUid: next };
    });
  };

  const blocker =
    ordered.length === 0
      ? 'Import groups before grading this project.'
      : !run.rubric
        ? 'Attach a rubric to this project first — the grader scores against it.'
        : null;

  if (blocker) {
    return (
      <EditorModalShell
        isOpen
        title={`Grade — ${run.title}`}
        isDirty={false}
        hideSaveButton
        onSave={() => undefined}
        onClose={onClose}
        maxWidth="max-w-xl"
        className="h-auto"
        saveErrorMessage={false}
      >
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <ClipboardList className="h-10 w-10 text-slate-300" aria-hidden />
          <p className="max-w-sm text-sm text-slate-600">{blocker}</p>
        </div>
      </EditorModalShell>
    );
  }

  const footerNav = (
    <div className="flex items-center gap-2">
      {allGraded && (
        <span
          role="status"
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xxs font-bold uppercase tracking-wider text-emerald-700"
        >
          <CheckCircle2 aria-hidden className="h-3 w-3" />
          All graded
        </span>
      )}
      <button
        type="button"
        onClick={() => void move(-1)}
        disabled={index === 0 || busy}
        aria-label="Previous group"
        title="Previous group"
        className={stepperButton}
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => skip(1)}
        disabled={index >= ordered.length - 1 || busy}
        className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 disabled:opacity-40"
      >
        Skip
      </button>
      <button
        type="button"
        onClick={() => void saveNow()}
        disabled={busy || !dirty}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40"
      >
        <Send aria-hidden className="h-3.5 w-3.5" />
        Save
      </button>
      <button
        type="button"
        onClick={() => void move(1)}
        disabled={index >= ordered.length - 1 || busy}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save and next'}
        <ChevronRight aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <EditorModalShell
      isOpen
      title={`Grade — ${run.title}`}
      subtitle={`Group ${index + 1} of ${ordered.length} · ${gradedCount} graded`}
      isDirty={false}
      hideSaveButton
      footerEnd={footerNav}
      onSave={() => undefined}
      onClose={onClose}
      maxWidth="max-w-5xl"
      bodyClassName="!p-0 !overflow-hidden"
      saveErrorMessage={false}
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(160px,1fr)_2.6fr]">
        <nav
          aria-label="Group queue"
          className="overflow-y-auto border-r border-slate-200 bg-slate-50"
        >
          <p className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur">
            Groups
          </p>
          <ul>
            {ordered.map((entry, idx) => {
              const entryGrade = gradesByGroupId[entry.id];
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(idx)}
                    aria-current={idx === index ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                      idx === index
                        ? 'bg-white font-bold text-brand-blue-dark'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {entry.name}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xxs uppercase tracking-wider ${
                        !entryGrade
                          ? 'bg-slate-200 text-slate-600'
                          : entryGrade.released
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {!entryGrade
                        ? 'To do'
                        : entryGrade.released
                          ? 'Released'
                          : 'Saved'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="overflow-y-auto bg-white">
          {loading ? (
            <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading grades…
            </p>
          ) : (
            <div className="flex flex-col gap-4 p-6">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {group?.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {saved
                    ? saved.released
                      ? 'Released to this group'
                      : 'Saved, not released'
                    : 'Not graded yet'}
                </p>
              </div>

              {run.rubric && (
                <RubricScoringPanel
                  key={hydrationKey}
                  rubric={run.rubric}
                  maxPoints={maxPoints}
                  initialScores={draft.rubricScores}
                  onChange={(rubricScores, derivedPoints) =>
                    setDraft((current) => ({
                      ...current,
                      rubricScores,
                      points: derivedPoints,
                    }))
                  }
                />
              )}

              <div>
                <label
                  className="text-xs font-bold text-slate-600"
                  htmlFor="project-grade-comment"
                >
                  Comment to the group
                </label>
                <textarea
                  id="project-grade-comment"
                  rows={3}
                  value={draft.comment}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      comment: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                />
              </div>

              {(group?.memberUids?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-600">
                    Individual scores (optional)
                  </p>
                  <p className="text-xs text-slate-500">
                    Blank uses the group score.
                  </p>
                  {(group?.memberUids ?? []).map((uid) => {
                    const override = draft.overridesByUid[uid];
                    const name = formatStudentName(byStudentUid.get(uid));
                    return (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                          {name || `Student ${uid.slice(0, 6)}`}
                        </span>
                        <label className="sr-only" htmlFor={`override-${uid}`}>
                          {`Points for ${name || 'this student'}`}
                        </label>
                        <input
                          id={`override-${uid}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={maxPoints}
                          value={override ? String(override.points) : ''}
                          onChange={(event) =>
                            setOverride(uid, { points: event.target.value })
                          }
                          placeholder={String(draft.points)}
                          className="w-20 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        <label
                          className="sr-only"
                          htmlFor={`override-note-${uid}`}
                        >
                          {`Note for ${name || 'this student'}`}
                        </label>
                        <input
                          id={`override-note-${uid}`}
                          type="text"
                          value={override?.note ?? ''}
                          disabled={!override}
                          onChange={(event) =>
                            setOverride(uid, { note: event.target.value })
                          }
                          placeholder="Why"
                          className="w-28 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <label className="flex items-center justify-between text-xs text-slate-600">
                Let this group see their score
                <Toggle
                  checked={draft.released}
                  onChange={(next) =>
                    setDraft((current) => ({ ...current, released: next }))
                  }
                  label="Let this group see their score"
                />
              </label>

              {savingError && (
                <p
                  role="status"
                  className="text-xs font-semibold text-brand-red-primary"
                >
                  {savingError}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </EditorModalShell>
  );
};
