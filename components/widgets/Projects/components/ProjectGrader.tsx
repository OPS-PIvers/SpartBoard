import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Send, X } from 'lucide-react';
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
import { RubricScoringPanel } from '@/components/widgets/QuizWidget/components/RubricScoringPanel';
import { rubricMaxPoints } from '@/utils/rubricPoints';
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

interface ProjectGraderProps {
  run: ProjectRun;
  groups: ProjectGroup[];
  orgId: string | null | undefined;
  onClose: () => void;
}

/**
 * D22 — the queue shell the quiz free-response grader uses, walking groups
 * instead of students: one subject at a time, prev/next, autosave on advance,
 * skip to move on without writing. `RubricScoringPanel` is dropped in
 * unchanged. The quiz grader's pin control has no analogue here — it picks
 * which of a student's takes to grade, and a group has one body of work.
 */
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
        next[uid] = { ...existing, points: parsed };
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

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          Import groups before grading this project.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-xs font-bold text-brand-blue-primary"
        >
          Close
        </button>
      </div>
    );
  }

  if (!run.rubric) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          Attach a rubric to this project first — the grader scores against it.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-xs font-bold text-brand-blue-primary"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900">
            {group?.name}
          </h3>
          <p className="text-xs text-slate-500">
            Group {index + 1} of {ordered.length}
            {saved
              ? ` · ${saved.released ? 'Released' : 'Saved, not released'}`
              : ' · Not graded'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the grader"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading grades…
        </p>
      ) : (
        <>
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

          <div>
            <label
              className="text-xs font-bold text-slate-600"
              htmlFor="project-grade-comment"
            >
              Comment to the group
            </label>
            <textarea
              id="project-grade-comment"
              rows={2}
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
                A score here replaces the group&apos;s for that student. Leave
                it blank and they get the group score.
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
                    <label className="sr-only" htmlFor={`override-note-${uid}`}>
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void move(-1)}
              disabled={index === 0 || busy}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
              Back
            </button>
            <button
              type="button"
              onClick={() => skip(1)}
              disabled={index >= ordered.length - 1 || busy}
              className="rounded-xl px-2 py-2 text-xs font-bold text-slate-500 disabled:opacity-40"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => void saveNow()}
              disabled={busy || !dirty}
              className="ml-auto inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
              Save
            </button>
            <button
              type="button"
              onClick={() => void move(1)}
              disabled={index >= ordered.length - 1 || busy}
              className="inline-flex items-center gap-1 rounded-xl bg-brand-blue-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save and next'}
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
