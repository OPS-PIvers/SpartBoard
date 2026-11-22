import React, { useEffect, useMemo, useState } from 'react';
import { History, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import type { InputSignals } from '@/types';
import { writingLogs, type WrittenAnswerLog } from '@/utils/inputSignals';
import {
  useWritingPlaybackAccess,
  type AnswerWritingLog,
} from '@/hooks/useWritingPlayback';
import {
  parseWritingLog,
  summarizeWriting,
  buildCheckpoints,
  textAt,
  writingSessions,
  SESSION_GAP_MS,
  type ParsedWritingLog,
  type WritingEdit,
} from '@/utils/writingLog';
import { BadgePopover } from './BadgePopover';
import { Modal } from './Modal';

const SPEEDS = [1, 2, 5, 10] as const;
/** A pause this long gets a timeline marker and a Skip pause button. */
const LONG_PAUSE_MS = 10_000;

const formatSpan = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} sec`;
};

const formatWhen = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const formatTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

const EDIT_LABEL: Record<WritingEdit['kind'], string | null> = {
  typed: null,
  pasted: 'Pasted',
  dictated: 'Dictated',
  sync: 'Appeared without typing',
  restored: 'Already here after a page reload',
  format: null,
  peer: 'Accepted from a partner',
};

/** A Writing record's facts-only playback (D9): no stats or signs of its own, plus marks like each turn in. */
export interface WritingPlayerFacts {
  marks: { at: number; label: string }[];
  /** Shown once playback reaches the end, such as where recording stopped. */
  endNote?: string;
  /** Jumps playback to an edit; a new `n` jumps again to the same place. */
  seek?: { at: number; n: number };
}

const FACT_LABEL: Record<WritingEdit['kind'], string | null> = {
  ...EDIT_LABEL,
  sync: 'Added without typing',
};

/** Replays one written answer edit by edit; `hidePasted` and `hideUnkeyed` follow signs an admin switched off. */
export const WritingPlayer: React.FC<{
  log: string | ParsedWritingLog;
  hidePasted?: boolean;
  hideUnkeyed?: boolean;
  /** Height of the replayed text box. */
  boxHeight?: string;
  facts?: WritingPlayerFacts;
}> = ({
  log,
  hidePasted = false,
  hideUnkeyed = false,
  boxHeight = 'h-64',
  facts,
}) => {
  const { edits, stamps, cutOff } = useMemo(
    () => (typeof log === 'string' ? parseWritingLog(log) : log),
    [log]
  );
  // Facts mode shows no stats, so it never pays for the summary.
  const showStats = !facts;
  const summary = useMemo(
    () => (showStats ? summarizeWriting(edits) : null),
    [edits, showStats]
  );
  const sessions = useMemo(
    () => writingSessions(edits, stamps),
    [edits, stamps]
  );
  // Where a later session picks up; playback goes straight on instead of waiting out the break.
  const sessionAt = useMemo(
    () => new Map(sessions.slice(1).map((x, i) => [x.at, i + 2])),
    [sessions]
  );
  const [index, setIndex] = useState(edits.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [seekN, setSeekN] = useState(facts?.seek?.n);
  if (facts?.seek && facts.seek.n !== seekN) {
    setSeekN(facts.seek.n);
    setPlaying(false);
    setIndex(Math.max(0, Math.min(facts.seek.at, edits.length)));
  }
  const markAt = useMemo(
    () => new Map((facts?.marks ?? []).map((m) => [m.at, m.label])),
    [facts]
  );

  const atEnd = index >= edits.length;
  useEffect(() => {
    if (!playing || atEnd) return;
    // A break of a session or longer (or one in a log from before session stamps) passes in a beat.
    const wait =
      sessionAt.has(index) || edits[index].dt >= SESSION_GAP_MS
        ? 600
        : edits[index].dt / speed;
    const id = window.setTimeout(
      () => setIndex((i) => Math.min(i + 1, edits.length)),
      Math.max(wait, 10)
    );
    return () => window.clearTimeout(id);
  }, [playing, atEnd, index, speed, edits, sessionAt]);

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
    last &&
    last.kind !== 'typed' &&
    last.kind !== 'format' &&
    shownKind(last.kind)
      ? last.ins.length
      : 0;
  // Dictated text is a fact about an accommodation, so it never takes the amber of a paste.
  const dictatedNow = last?.kind === 'dictated';
  const peerNow = last?.kind === 'peer';
  const next = atEnd ? undefined : edits[index];
  const nextSession = sessionAt.get(index);
  const inPause =
    !!next && next.dt >= LONG_PAUSE_MS && nextSession === undefined;
  const labels = facts ? FACT_LABEL : EDIT_LABEL;
  const note =
    (atEnd && facts?.endNote ? facts.endNote : null) ??
    markAt.get(index) ??
    (nextSession !== undefined
      ? `Session ${nextSession} starts ${formatWhen(sessions[nextSession - 1].start)}`
      : null) ??
    (last && shownKind(last.kind) ? labels[last.kind] : null) ??
    (inPause && next ? `Paused for ${formatSpan(next.dt)} here` : null);

  const pauses = useMemo(
    () =>
      edits.flatMap((e, i) =>
        e.dt >= LONG_PAUSE_MS && !sessionAt.has(i) ? [{ at: i, ms: e.dt }] : []
      ),
    [edits, sessionAt]
  );

  const toggle = () => {
    if (atEnd) setIndex(0);
    setPlaying(atEnd ? true : !playing);
  };
  const isPlaying = playing && !atEnd;

  return (
    <div className="space-y-3">
      {summary && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ['Writing time', formatSpan(summary.writingMs)],
            ...(sessions.length > 0
              ? [['Sessions', sessions.length.toLocaleString()]]
              : []),
            ['Edits', summary.edits.toLocaleString()],
            [
              'Deletions',
              `${summary.deletions.toLocaleString()} (${count(summary.deletedChars, 'character')})`,
            ],
            ['Full words replaced', summary.wordsReplaced.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {label}
              </dt>
              <dd className="font-semibold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!facts && sessions.length > 0 && (
        <ol className="space-y-0.5 text-sm text-slate-700">
          {sessions.map((x, i) => (
            <li key={x.at}>
              <span className="font-semibold">Session {i + 1}:</span>{' '}
              {formatWhen(x.start)} to {formatTime(x.end)}
            </li>
          ))}
        </ol>
      )}
      {summary &&
        ((summary.pastedChars > 0 && !hidePasted) ||
          (summary.syncChars > 0 && !hideUnkeyed) ||
          summary.dictatedChars > 0 ||
          summary.restoredChars > 0) && (
          <p className="text-sm text-slate-700">
            {[
              summary.pastedChars > 0 &&
                !hidePasted &&
                `${count(summary.pastedChars, 'character')} pasted`,
              summary.dictatedChars > 0 &&
                `${count(summary.dictatedChars, 'character')} dictated`,
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
        className={`${boxHeight} overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900`}
      >
        {text.slice(0, caret - marked)}
        <mark
          className={
            dictatedNow
              ? 'bg-slate-200'
              : peerNow
                ? 'bg-sky-100'
                : 'bg-amber-200'
          }
        >
          {text.slice(caret - marked, caret)}
        </mark>
        <span
          aria-hidden
          className="-mx-px inline-block h-4 w-0.5 translate-y-0.5 bg-brand-blue-primary"
        />
        {text.slice(caret)}
      </div>
      <div className="flex h-6 items-center gap-2">
        <p
          className={`text-xs font-semibold ${atEnd && facts?.endNote ? 'text-slate-700' : markAt.has(index) ? 'text-teal-800' : nextSession !== undefined ? 'text-brand-blue-primary' : dictatedNow ? 'text-slate-700' : peerNow ? 'text-sky-800' : 'text-amber-700'}`}
        >
          {note}
        </p>
        {inPause && (
          // no-tour-anchor: playback of one student's answer, nothing a tour walks to
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(i + 1, edits.length))}
            className="touch-target-expand relative inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold text-brand-blue-primary hover:bg-slate-100 hover:text-brand-blue-dark focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            <SkipForward aria-hidden className="h-3.5 w-3.5" />
            Skip pause
          </button>
        )}
      </div>
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
        <div className="min-w-0 flex-1">
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
            className="block w-full accent-brand-blue-primary"
          />
          {/* Markers get their own row so they never take clicks meant for the slider. */}
          <div className="relative h-5">
            {sessions.slice(1).map((x, i) => (
              // no-tour-anchor: one session in one student's answer, nothing a tour walks to
              <button
                key={`s${x.at}`}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setIndex(x.at);
                }}
                title={`Session ${i + 2}: ${formatWhen(x.start)}`}
                aria-label={`Jump to session ${i + 2}`}
                style={{
                  left: `calc(8px + (100% - 16px) * ${x.at / Math.max(edits.length, 1)})`,
                }}
                className="group absolute inset-y-0 flex w-4 -translate-x-1/2 justify-center pt-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
              >
                <span className="h-3 w-1 rounded-full bg-brand-blue-primary group-hover:bg-brand-blue-dark" />
              </button>
            ))}
            {(facts?.marks ?? []).map((m) => (
              // no-tour-anchor: one turn in on one student's record, nothing a tour walks to
              <button
                key={`m${m.at}-${m.label}`}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setIndex(m.at);
                }}
                title={m.label}
                aria-label={m.label}
                style={{
                  left: `calc(8px + (100% - 16px) * ${m.at / Math.max(edits.length, 1)})`,
                }}
                className="group absolute inset-y-0 flex w-4 -translate-x-1/2 justify-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
              >
                <span className="h-4 w-1 rounded-full bg-teal-700 group-hover:bg-teal-800" />
              </button>
            ))}
            {pauses.map((p) => (
              // no-tour-anchor: one pause in one student's answer, nothing a tour walks to
              <button
                key={p.at}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setIndex(p.at);
                }}
                title={`Paused ${formatSpan(p.ms)}`}
                aria-label={`Jump to the ${formatSpan(p.ms)} pause`}
                style={{
                  left: `calc(8px + (100% - 16px) * ${p.at / Math.max(edits.length, 1)})`,
                }}
                className="group absolute inset-y-0 flex w-4 -translate-x-1/2 justify-center pt-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
              >
                <span className="h-2.5 w-1 rounded-full bg-amber-500 group-hover:bg-amber-600" />
              </button>
            ))}
          </div>
        </div>
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
      {cutOff && !facts && (
        <p className="text-xs text-slate-600">
          Recording stopped at its size limit before the end.
        </p>
      )}
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

/** The grader's inline playback of the answer being graded. */
export const AnswerWritingPlayback: React.FC<{
  playback: AnswerWritingLog;
}> = ({ playback }) => (
  <div>
    {playback.hidden && (
      <p className="mb-2 text-xs font-semibold text-slate-500">
        Hidden from teachers
      </p>
    )}
    <WritingPlayer
      log={playback.log}
      hidePasted={playback.hidePasted}
      hideUnkeyed={playback.hideUnkeyed}
      boxHeight="h-40"
    />
  </div>
);

/** One answer in the badge list; its stats are worked out only once the list is open. */
const PlaybackAnswerRow: React.FC<{
  answer: WrittenAnswerLog;
  label: string;
  onOpen: (answer: WrittenAnswerLog) => void;
}> = ({ answer, label, onOpen }) => {
  const s = useMemo(
    () => summarizeWriting(parseWritingLog(answer.log).edits),
    [answer.log]
  );
  return (
    <li>
      {/* no-tour-anchor: one student's answer, nothing a tour walks to */}
      <button
        type="button"
        onClick={() => onOpen(answer)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        <Play
          aria-hidden
          className="h-4 w-4 shrink-0 text-brand-blue-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-800">{label}</span>
          <span className="block text-xs text-slate-600">
            {count(s.finalText.length, 'character')},{' '}
            {count(s.deletions + s.wordsReplaced, 'revision')}
          </span>
        </span>
      </button>
    </li>
  );
};

/** A badge that lists a student's written answers and replays how each was written; nothing without the flag or a log. */
export const WritingPlaybackBadge: React.FC<WritingPlaybackBadgeProps> = ({
  signals,
  studentName,
  questionOrder,
  children,
}) => {
  const { enabled, hidden, hidePasted, hideUnkeyed } =
    useWritingPlaybackAccess();
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
              {answers.map((a) => (
                <PlaybackAnswerRow
                  key={`${a.attempt}-${a.questionId}`}
                  answer={a}
                  label={`${label(a)}${manyAttempts ? `, attempt ${a.attempt + 1}` : ''}`}
                  onOpen={setOpen}
                />
              ))}
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
