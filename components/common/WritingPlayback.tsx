import React, { useContext, useEffect, useMemo, useState } from 'react';
import { History, Pause, Play, RotateCcw } from 'lucide-react';
import type { InputSignals } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import {
  INPUT_SIGNALS_FEATURE,
  writingLogs,
  type WrittenAnswerLog,
} from '@/utils/inputSignals';
import {
  isSignShown,
  readInputSignSettings,
} from '@/utils/inputSignalSettings';
import {
  PAUSE_CAP_MS,
  parseWritingLog,
  summarizeWriting,
  buildCheckpoints,
  textAt,
  type WritingEdit,
} from '@/utils/writingLog';
import { BadgePopover } from './BadgePopover';
import { Modal } from './Modal';

const SPEEDS = [1, 2, 5, 10] as const;
/** A pause this long is called out during playback. */
const LONG_PAUSE_MS = 10_000;

const formatSpan = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} sec`;
};

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

const EDIT_LABEL: Record<WritingEdit['kind'], string | null> = {
  typed: null,
  pasted: 'Pasted',
  sync: 'Appeared without typing',
  restored: 'Already here after a page reload',
};

/** Replays one written answer edit by edit; `hidePasted` and `hideUnkeyed` follow signs an admin switched off. */
export const WritingPlayer: React.FC<{
  log: string;
  hidePasted?: boolean;
  hideUnkeyed?: boolean;
}> = ({ log, hidePasted = false, hideUnkeyed = false }) => {
  const { edits, cutOff } = useMemo(() => parseWritingLog(log), [log]);
  const summary = useMemo(() => summarizeWriting(edits), [edits]);
  const [index, setIndex] = useState(edits.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);

  const atEnd = index >= edits.length;
  useEffect(() => {
    if (!playing || atEnd) return;
    const wait = Math.min(edits[index].dt, PAUSE_CAP_MS) / speed;
    const id = window.setTimeout(
      () => setIndex((i) => Math.min(i + 1, edits.length)),
      Math.max(wait, 10)
    );
    return () => window.clearTimeout(id);
  }, [playing, atEnd, index, speed, edits]);

  const checkpoints = useMemo(() => buildCheckpoints(edits), [edits]);
  const text = useMemo(
    () => textAt(edits, checkpoints, index),
    [edits, checkpoints, index]
  );
  const last = index > 0 ? edits[index - 1] : undefined;
  const caret = last ? last.pos + last.ins.length : 0;
  const shownKind = (kind: WritingEdit['kind']) =>
    !((kind === 'pasted' && hidePasted) || (kind === 'sync' && hideUnkeyed));
  const marked =
    last && last.kind !== 'typed' && shownKind(last.kind) ? last.ins.length : 0;
  const next = atEnd ? undefined : edits[index];
  const note =
    (last && shownKind(last.kind) ? EDIT_LABEL[last.kind] : null) ??
    (next && next.dt >= LONG_PAUSE_MS
      ? `Paused for ${formatSpan(next.dt)} here`
      : null);

  const toggle = () => {
    if (atEnd) setIndex(0);
    setPlaying(atEnd ? true : !playing);
  };
  const isPlaying = playing && !atEnd;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {[
          ['Writing time', formatSpan(summary.writingMs)],
          ['Edits', summary.edits.toLocaleString()],
          [
            'Deletions',
            `${summary.deletions.toLocaleString()} (${count(summary.deletedChars, 'character')})`,
          ],
          ['Added mid-text', summary.insertsInside.toLocaleString()],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {label}
            </dt>
            <dd className="font-semibold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      {((summary.pastedChars > 0 && !hidePasted) ||
        (summary.syncChars > 0 && !hideUnkeyed) ||
        summary.restoredChars > 0) && (
        <p className="text-sm text-slate-700">
          {[
            summary.pastedChars > 0 &&
              !hidePasted &&
              `${count(summary.pastedChars, 'character')} pasted`,
            summary.restoredChars > 0 &&
              `${count(summary.restoredChars, 'character')} typed just before a page reload were not recorded`,
            summary.syncChars > 0 &&
              !hideUnkeyed &&
              `${count(summary.syncChars, 'character')} appeared without typing`,
          ]
            .filter(Boolean)
            .join('; ')}
          .
        </p>
      )}
      <div
        aria-live="off"
        className="h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900"
      >
        {text.slice(0, caret - marked)}
        <mark className="bg-amber-200">
          {text.slice(caret - marked, caret)}
        </mark>
        <span
          aria-hidden
          className="-mx-px inline-block h-4 w-0.5 translate-y-0.5 bg-brand-blue-primary"
        />
        {text.slice(caret)}
      </div>
      <p className="h-5 text-xs font-semibold text-amber-700">{note}</p>
      <div className="flex items-center gap-3">
        {/* no-tour-anchor: playback of one student's answer, nothing a tour walks to */}
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'Pause' : atEnd ? 'Play again' : 'Play'}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue-primary text-white hover:bg-brand-blue-dark focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2"
        >
          {isPlaying ? (
            <Pause aria-hidden className="h-4 w-4" />
          ) : atEnd ? (
            <RotateCcw aria-hidden className="h-4 w-4" />
          ) : (
            <Play aria-hidden className="h-4 w-4" />
          )}
        </button>
        {/* no-tour-anchor: playback of one student's answer, nothing a tour walks to */}
        <input
          type="range"
          min={0}
          max={edits.length}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          aria-label="Position in the writing"
          aria-valuetext={`Edit ${index} of ${edits.length}`}
          className="min-w-0 flex-1 accent-brand-blue-primary"
        />
        {/* no-tour-anchor: playback of one student's answer, nothing a tour walks to */}
        <select
          value={speed}
          onChange={(e) =>
            setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])
          }
          aria-label="Playback speed"
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-slate-600">
        Pauses longer than {PAUSE_CAP_MS / 1000} seconds are shortened.
        {cutOff && ' Recording stopped at its size limit before the end.'}
      </p>
    </div>
  );
};

interface WritingPlaybackBadgeProps {
  signals: InputSignals | undefined;
  studentName: string;
  /** Question ids in the quiz's own order, to number them. */
  questionOrder?: readonly string[];
  /** Renders the badge for a count of written answers. */
  children: (count: number) => React.ReactNode;
}

/** A badge that lists a student's written answers and replays how each was written; nothing without the flag or a log. */
export const WritingPlaybackBadge: React.FC<WritingPlaybackBadgeProps> = ({
  signals,
  studentName,
  questionOrder,
  children,
}) => {
  const auth = useContext(AuthContext);
  const signs = readInputSignSettings(auth?.globalPermissions);
  const isAdmin = auth?.isAdmin === true;
  const hidden = !isSignShown(signs, 'writing-playback');
  const hidePasted = !isAdmin && !isSignShown(signs, 'pasted');
  const hideUnkeyed = !isAdmin && !isSignShown(signs, 'unkeyed-text');
  const enabled =
    auth?.canAccessFeature?.(INPUT_SIGNALS_FEATURE) === true &&
    (!hidden || isAdmin);
  const answers = useMemo(
    () => (enabled ? writingLogs(signals) : []),
    [enabled, signals]
  );
  const [open, setOpen] = useState<WrittenAnswerLog | null>(null);
  if (answers.length === 0) return null;

  const label = (a: WrittenAnswerLog) => {
    const n = (questionOrder?.indexOf(a.questionId) ?? -1) + 1;
    return n > 0 ? `Question ${n}` : 'Written answer';
  };
  const manyAttempts = new Set(answers.map((a) => a.attempt)).size > 1;

  return (
    <>
      <BadgePopover
        triggerLabel={`Show writing playback for ${studentName}`}
        dialogLabel={`Writing playback for ${studentName}`}
        panel={
          <>
            <p className="mb-2 flex items-center gap-1.5 font-bold text-slate-800">
              <History aria-hidden className="h-4 w-4 shrink-0" />
              Writing playback
            </p>
            {hidden && (
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Hidden from teachers
              </p>
            )}
            <ul className="space-y-1">
              {answers.map((a) => {
                const s = summarizeWriting(parseWritingLog(a.log).edits);
                return (
                  <li key={`${a.attempt}-${a.questionId}`}>
                    {/* no-tour-anchor: one student's answer, nothing a tour walks to */}
                    <button
                      type="button"
                      onClick={() => setOpen(a)}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                    >
                      <Play
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-brand-blue-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-800">
                          {label(a)}
                          {manyAttempts && `, attempt ${a.attempt + 1}`}
                        </span>
                        <span className="block text-xs text-slate-600">
                          {count(s.finalText.length, 'character')},{' '}
                          {count(s.deletions + s.insertsInside, 'revision')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        }
      >
        {children(answers.length)}
      </BadgePopover>
      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(null)}
          title={`${studentName}: ${label(open)}${manyAttempts ? `, attempt ${open.attempt + 1}` : ''}`}
          maxWidth="max-w-2xl"
        >
          <WritingPlayer
            key={`${open.attempt}-${open.questionId}`}
            log={open.log}
            hidePasted={hidePasted}
            hideUnkeyed={hideUnkeyed}
          />
        </Modal>
      )}
    </>
  );
};
