import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useScoredWorkScores } from '@/hooks/useScoredWork';
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
import { seatDisplayName } from '@/utils/scoredWorkNames';
import type { ScoredWork } from '@/types';

const currentTime = (): number => Date.now();

interface ScoringStepProps {
  work: ScoredWork;
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

export const ScoringStep: React.FC<ScoringStepProps> = ({ work }) => {
  const { user } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { data: scores } = useScoredWorkScores(user?.uid, work.id);
  const [selected, setSelected] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Record<string, number>>>(
    {}
  );

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
  const current = selected ?? seats[0] ?? null;
  const fileIds = (current !== null ? work.scans?.[current] : undefined) ?? [];
  const images = useScanImages(fileIds);

  const nameOf = (seat: number): string =>
    seatDisplayName(rosters, work.seats[seat])?.name ??
    (work.spareSeats.includes(seat) ? `Spare sheet ${seat}` : `Seat ${seat}`);

  const levelsFor = (seat: number): Record<string, number> =>
    drafts[seat] ?? scoreBySeat.get(seat)?.levels ?? {};

  const pick = (seat: number, criterionId: string, level: number) => {
    if (!user) return;
    const next = cleanLevels(work.rubric, {
      ...levelsFor(seat),
      [criterionId]: level,
    });
    setDrafts((d) => ({ ...d, [seat]: next }));
    const doc = buildScoreDoc(work.rubric, seat, next, currentTime());
    if (doc) {
      saveScore(user.uid, work.id, doc).catch(() =>
        addToast('That score did not save. Try again.', 'error')
      );
    }
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
    const at = seats.indexOf(current);
    const next = seats[at + delta];
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

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-0">
      <ul
        aria-label="Students"
        className="md:w-56 md:shrink-0 max-h-48 md:max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100"
      >
        {seats.map((seat) => {
          const done = scoreBySeat.has(seat);
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
                {done ? (
                  <Check
                    className="w-4 h-4 text-emerald-600"
                    aria-label="Scored"
                  />
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

            {work.rubric.criteria.map((c) => (
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
                          onClick={() => pick(current, c.id, index)}
                          title={level.description}
                          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm min-h-11 ${
                            on
                              ? 'border-brand-blue-primary bg-brand-blue-lighter font-semibold'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{level.label}</span>
                          <span className="text-slate-600">{level.points}</span>
                        </button>
                      );
                    })}
                </div>
              </fieldset>
            ))}

            <div className="flex items-center gap-3 border-t border-slate-200 pt-3">
              <span className="text-sm font-semibold text-slate-800">
                {totals.points} / {max}
              </span>
              {scoreBySeat.has(current) && (
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
