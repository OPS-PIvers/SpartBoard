import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import {
  assignSpareSeat,
  deleteScore,
  saveScore,
} from '@/utils/scoredWorkStore';
import { downloadScanPage } from '@/utils/scoredWorkDrive';
import {
  buildScoreDoc,
  cleanLevels,
  rubricMaxPoints,
  scoreTotals,
} from '@/utils/scoredWorkMath';
import {
  RIGHT_LEVEL,
  WRONG_LEVEL,
  allCorrect,
} from '@/utils/scoredWorkQuestions';
import { seatDisplayName } from '@/utils/scoredWorkNames';
import type { ScoredWork, ScoredWorkScore } from '@/types';

const currentTime = (): number => Date.now();

interface ScoringStepProps {
  work: ScoredWork;
  scores: readonly ScoredWorkScore[];
}

/** Object URLs of Drive scan images, loaded on demand and freed on unmount. */
function useScanImages(fileIds: ReadonlyArray<string | null>) {
  const { driveService } = useGoogleDrive();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const cache = useRef<Record<string, string>>({});
  const key = fileIds.join('|');

  useEffect(() => {
    if (!driveService) return;
    let cancelled = false;
    for (const id of fileIds) {
      if (!id || cache.current[id]) continue;
      downloadScanPage(driveService, id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          cache.current[id] = url;
          setUrls((prev) => ({ ...prev, [id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // `key` stands for the id list so a new array each render does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveService, key]);

  useEffect(() => {
    const held = cache.current;
    return () => Object.values(held).forEach((u) => URL.revokeObjectURL(u));
  }, []);

  return urls;
}

export const ScoringStep: React.FC<ScoringStepProps> = ({ work, scores }) => {
  const { user } = useAuth();
  const { rosters, addToast } = useDashboard();
  const [selected, setSelected] = useState<number | null>(null);
  const [onlyUnscored, setOnlyUnscored] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, Record<string, number>>>(
    {}
  );
  const byQuestions = work.scoring === 'questions';

  const seats = useMemo(() => {
    const scanned = new Set(Object.keys(work.scans ?? {}).map(Number));
    return [
      ...Object.keys(work.seats).map(Number),
      ...work.spareSeats.filter((s) => scanned.has(s)),
    ].sort((a, b) => a - b);
  }, [work.seats, work.spareSeats, work.scans]);

  const scoreBySeat = useMemo(
    () => new Map(scores.map((s) => [s.seat, s])),
    [scores]
  );
  const firstUnscored = seats.find((s) => !scoreBySeat.has(s));
  const current = selected ?? firstUnscored ?? seats[0] ?? null;
  const visibleSeats = onlyUnscored
    ? seats.filter((s) => !scoreBySeat.has(s) || s === current)
    : seats;
  const fileIds = (current !== null ? work.scans?.[current] : undefined) ?? [];
  const images = useScanImages(fileIds);

  const nameOf = (seat: number): string =>
    seatDisplayName(rosters, work.seats[seat])?.name ??
    (work.spareSeats.includes(seat) ? `Spare sheet ${seat}` : `Seat ${seat}`);

  // A question worksheet starts every student all correct, so only misses need a click.
  const levelsFor = (seat: number): Record<string, number> =>
    drafts[seat] ??
    scoreBySeat.get(seat)?.levels ??
    (byQuestions ? allCorrect(work.rubric) : {});

  const advanceFrom = (seat: number) => {
    const at = seats.indexOf(seat);
    const ordered = [...seats.slice(at + 1), ...seats.slice(0, at)];
    const next = ordered.find((s) => !scoreBySeat.has(s));
    if (next !== undefined) setSelected(next);
  };

  const persist = (seat: number, levels: Record<string, number>): boolean => {
    if (!user) return false;
    const doc = buildScoreDoc(work.rubric, seat, levels, currentTime());
    if (!doc) return false;
    saveScore(user.uid, work.id, doc).catch(() =>
      addToast('That score did not save. Try again.', 'error')
    );
    return true;
  };

  const setLevel = (seat: number, criterionId: string, level: number) => {
    const wasSaved = scoreBySeat.has(seat);
    const next = cleanLevels(work.rubric, {
      ...levelsFor(seat),
      [criterionId]: level,
    });
    setDrafts((d) => ({ ...d, [seat]: next }));
    // A saved score keeps saving as it is edited; a new one saves when complete (rubric) or on Save.
    if (wasSaved || !byQuestions) {
      const saved = persist(seat, next);
      if (saved && !wasSaved && !byQuestions) advanceFrom(seat);
    }
  };

  const saveAndNext = (seat: number) => {
    if (persist(seat, levelsFor(seat))) advanceFrom(seat);
  };

  const clear = (seat: number) => {
    if (!user) return;
    setDrafts((d) => ({ ...d, [seat]: {} }));
    deleteScore(user.uid, work.id, seat).catch(() =>
      addToast('Could not clear that score.', 'error')
    );
  };

  const move = (delta: number) => {
    if (current === null) return;
    const next = seats[seats.indexOf(current) + delta];
    if (next !== undefined) setSelected(next);
  };

  const unassigned = useMemo(() => {
    const taken = new Set(Object.values(work.seats).map((s) => s.studentId));
    return rosters
      .filter((r) => work.rosterIds.includes(r.id))
      .flatMap((r) =>
        r.students
          .filter((s) => !taken.has(s.id))
          .map((s) => ({
            key: `${r.id}::${s.id}`,
            rosterId: r.id,
            studentId: s.id,
            label: `${[s.lastName, s.firstName].filter(Boolean).join(', ')} (${r.name})`,
          }))
      );
  }, [rosters, work.rosterIds, work.seats]);

  if (seats.length === 0) {
    return (
      <p className="text-sm text-slate-600">Scan the stack to start scoring.</p>
    );
  }
  const max = rubricMaxPoints(work.rubric);
  const isSpare = current !== null && work.spareSeats.includes(current);
  const live = current !== null ? levelsFor(current) : {};
  const totals = scoreTotals(work.rubric, live);
  const currentSaved = current !== null && scoreBySeat.has(current);

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-0">
      <div className="md:w-56 md:shrink-0 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input // no-tour-anchor: preview feature, tours are added when it opens
            type="checkbox"
            checked={onlyUnscored}
            onChange={(e) => setOnlyUnscored(e.target.checked)}
          />
          Unscored only
        </label>
        <ul
          aria-label="Students"
          className="max-h-48 md:max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100"
        >
          {visibleSeats.map((seat) => {
            const saved = scoreBySeat.get(seat);
            const scanned = !!work.scans?.[seat]?.some(Boolean);
            return (
              <li key={seat}>
                <button // no-tour-anchor: preview feature, tours are added when it opens
                  type="button"
                  onClick={() => setSelected(seat)}
                  aria-current={seat === current}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    seat === current
                      ? 'bg-brand-blue-lighter font-semibold'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex-1 truncate">{nameOf(seat)}</span>
                  {saved ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <Check className="w-3.5 h-3.5" aria-label="Scored" />
                      {saved.points}/{saved.max}
                    </span>
                  ) : (
                    !scanned && (
                      <span className="text-xs text-slate-500">No scan</span>
                    )
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {current !== null && (
        <div className="flex-1 min-w-0 grid gap-4 lg:grid-cols-2 pb-6">
          <div className="space-y-2">
            {fileIds.length === 0 && (
              <p className="text-sm text-slate-600">
                No scan for this student.
              </p>
            )}
            {fileIds.map((id, i) =>
              id && images[id] ? (
                <img
                  key={id}
                  src={images[id]}
                  alt={`${nameOf(current)} page ${i + 1}`}
                  className="w-full rounded border border-slate-200"
                />
              ) : (
                <div
                  key={id ?? i}
                  className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500"
                >
                  {id ? 'Loading page' : `Page ${i + 1} missing`}
                </div>
              )
            )}
          </div>

          <div className="space-y-4">
            {isSpare && (
              <label className="block text-sm">
                <span className="block font-semibold text-slate-700 mb-1">
                  Whose work is this?
                </span>
                <select // no-tour-anchor: preview feature, tours are added when it opens
                  defaultValue=""
                  onChange={(e) => {
                    const target = unassigned.find(
                      (u) => u.key === e.target.value
                    );
                    if (target && user) {
                      void assignSpareSeat(user.uid, work.id, current, {
                        rosterId: target.rosterId,
                        studentId: target.studentId,
                      });
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  <option value="">Choose a student</option>
                  {unassigned.map((u) => (
                    <option key={u.key} value={u.key}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <h3 className="text-base font-semibold text-slate-800">
              {nameOf(current)}
            </h3>

            {byQuestions ? (
              <div
                role="group"
                aria-label="Questions"
                className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5"
              >
                {work.rubric.criteria.map((c, i) => {
                  const right = live[c.id] !== WRONG_LEVEL;
                  return (
                    <button // no-tour-anchor: preview feature, tours are added when it opens
                      key={c.id}
                      type="button"
                      aria-pressed={!right}
                      aria-label={`Question ${i + 1}, ${right ? 'correct' : 'incorrect'}`}
                      onClick={() =>
                        setLevel(
                          current,
                          c.id,
                          right ? WRONG_LEVEL : RIGHT_LEVEL
                        )
                      }
                      className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold ${
                        right
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-rose-300 bg-rose-100 text-rose-800'
                      }`}
                    >
                      {i + 1} {right ? '✓' : '✗'}
                    </button>
                  );
                })}
              </div>
            ) : (
              work.rubric.criteria.map((c) => (
                <fieldset key={c.id}>
                  <legend className="text-sm font-semibold text-slate-700 mb-1">
                    {c.name}
                  </legend>
                  <div
                    role="radiogroup"
                    aria-label={c.name}
                    className="grid gap-1.5"
                  >
                    {c.levels
                      .map((level, index) => ({ level, index }))
                      .reverse()
                      .map(({ level, index }) => {
                        const on = live[c.id] === index;
                        return (
                          <button // no-tour-anchor: preview feature, tours are added when it opens
                            key={level.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setLevel(current, c.id, index)}
                            title={level.description}
                            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm min-h-11 ${
                              on
                                ? 'border-brand-blue-primary bg-brand-blue-lighter font-semibold'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="truncate">{level.label}</span>
                            <span className="text-slate-600">
                              {level.points}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </fieldset>
              ))
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
              <span className="text-sm font-semibold text-slate-800">
                {totals.points} / {max}
              </span>
              {byQuestions && !currentSaved && (
                <button // no-tour-anchor: preview feature, tours are added when it opens
                  type="button"
                  onClick={() => saveAndNext(current)}
                  className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-light min-h-11"
                >
                  Save and next
                </button>
              )}
              {currentSaved && (
                <button // no-tour-anchor: preview feature, tours are added when it opens
                  type="button"
                  onClick={() => clear(current)}
                  className="text-sm text-slate-600 underline"
                >
                  Clear score
                </button>
              )}
              <span className="flex-1" />
              <button // no-tour-anchor: preview feature, tours are added when it opens
                type="button"
                onClick={() => move(-1)}
                aria-label="Previous student"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 touch-target-expand"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button // no-tour-anchor: preview feature, tours are added when it opens
                type="button"
                onClick={() => move(1)}
                aria-label="Next student"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 touch-target-expand"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
