// The Writing record (D9): the summary, each paste and untyped addition with its text, and facts-only playback.
import React, { useMemo, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import type { WritingDraft, WritingResponseSummary } from '@/types';
import {
  draftMarkAt,
  readWritingRecord,
  type WritingRecordChunk,
  type WritingRecordInsert,
} from '@/utils/writingRecord';
import { useWritingRecordChunks } from '@/hooks/useWritingRecord';
import { WritingPlayer } from './WritingPlayback';

const WRITING_RECORD_STRINGS = {
  timeWriting: 'Time writing',
  sessions: 'Writing sessions',
  pastes: 'Pastes',
  untyped: 'Added without typing',
  away: 'Time away',
  none: 'None',
  times: (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`,
  chars: (n: number) =>
    `${n.toLocaleString()} ${n === 1 ? 'character' : 'characters'}`,
  playFromHere: 'Play from here',
  draftTurnedIn: (n: number) => `Draft ${n} turned in`,
  logFull: 'Recording stopped here: the log was full.',
  purged: 'Playback no longer available.',
  empty: 'No writing recorded yet.',
  loading: 'Loading',
  loadFailed: "Couldn't load the Writing record.",
} as const;

const S = WRITING_RECORD_STRINGS;

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

const span = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} sec`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} hr` : `${h} hr ${m % 60} min`;
};

export interface WritingRecordFacts {
  summary: Partial<WritingResponseSummary> | undefined;
  logPurgedAt?: number;
}

const SummaryRow: React.FC<{ summary: WritingRecordFacts['summary'] }> = ({
  summary,
}) => {
  const s = summary ?? {};
  const paste = num(s.pasteCount);
  const untyped = num(s.untypedCount);
  const away = num(s.awayCount);
  const rows: [string, string][] = [
    [S.timeWriting, span(num(s.writingMs))],
    [S.sessions, num(s.sessions).toLocaleString()],
    [
      S.pastes,
      paste === 0
        ? S.none
        : `${paste.toLocaleString()} (${S.chars(num(s.pastedChars))})`,
    ],
    [
      S.untyped,
      untyped === 0
        ? S.none
        : `${untyped.toLocaleString()} (${S.chars(num(s.untypedChars))})`,
    ],
    [S.away, away === 0 ? S.none : `${span(num(s.awayMs))}, ${S.times(away)}`],
  ];
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {label}
          </dt>
          <dd className="font-semibold text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

const InsertList: React.FC<{
  title: string;
  items: WritingRecordInsert[];
  onPlay?: (at: number) => void;
}> = ({ title, items, onPlay }) =>
  items.length === 0 ? null : (
    <section>
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {title}
      </h4>
      <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
        {items.map((item, i) => (
          <li key={`${item.at}-${i}`} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-600">
                {S.chars(item.text.length)}
              </span>
              {onPlay && (
                // no-tour-anchor: one paste in one student's record, nothing a tour walks to
                <button
                  type="button"
                  onClick={() => onPlay(item.at)}
                  className="touch-target-expand relative inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold text-brand-blue-primary hover:bg-slate-100 hover:text-brand-blue-dark focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                >
                  <Play aria-hidden className="h-3.5 w-3.5" />
                  {S.playFromHere}
                </button>
              )}
            </div>
            <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-800">
              {item.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );

type DraftMarkSource = Pick<WritingDraft, 'number' | 'logMark'>;

/** The record from chunks already read; the student and teacher views and the harness share it. */
export const WritingRecordView: React.FC<{
  chunks: readonly WritingRecordChunk[];
  facts: WritingRecordFacts;
  drafts?: readonly DraftMarkSource[];
  boxHeight?: string;
}> = ({ chunks, facts, drafts, boxHeight = 'h-64' }) => {
  const record = useMemo(
    () =>
      readWritingRecord(chunks, {
        summary: facts.summary,
        logPurgedAt: facts.logPurgedAt,
      }),
    [chunks, facts.summary, facts.logPurgedAt]
  );
  const [seek, setSeek] = useState<{ at: number; n: number } | undefined>();
  const marks = useMemo(() => {
    if (record.kind !== 'playback' || !drafts) return [];
    return drafts.flatMap((d) => {
      const at = draftMarkAt(record.log, chunks, d.logMark);
      return at === null ? [] : [{ at, label: S.draftTurnedIn(d.number) }];
    });
  }, [record, drafts, chunks]);
  const playerFacts = useMemo(
    () => ({
      marks,
      endNote:
        record.kind === 'playback' && record.stoppedAt !== null
          ? S.logFull
          : undefined,
      seek,
    }),
    [marks, record, seek]
  );
  const onPlay =
    record.kind === 'playback'
      ? (at: number) => setSeek((p) => ({ at, n: (p?.n ?? 0) + 1 }))
      : undefined;

  return (
    <div className="space-y-4">
      <SummaryRow summary={facts.summary} />
      {record.kind === 'playback' && (
        <WritingPlayer
          log={record.log}
          boxHeight={boxHeight}
          facts={playerFacts}
        />
      )}
      {record.kind === 'purged' && (
        <p className="text-sm font-semibold text-slate-700">{S.purged}</p>
      )}
      {record.kind === 'empty' && (
        <p className="text-sm text-slate-600">{S.empty}</p>
      )}
      {record.kind !== 'empty' && (
        <>
          <InsertList
            title={S.pastes}
            items={record.inserts.pastes}
            onPlay={onPlay}
          />
          <InsertList
            title={S.untyped}
            items={record.inserts.untyped}
            onPlay={onPlay}
          />
        </>
      )}
    </div>
  );
};

/** Reads one student's log chunks and shows their Writing record. */
export const WritingRecord: React.FC<{
  sessionId: string;
  studentUid: string;
  facts: WritingRecordFacts;
  drafts?: readonly DraftMarkSource[];
  boxHeight?: string;
}> = ({ sessionId, studentUid, facts, drafts, boxHeight }) => {
  const load = useWritingRecordChunks(sessionId, studentUid);
  if (load.kind === 'loading')
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        {S.loading}
      </p>
    );
  if (load.kind === 'error')
    return (
      <p role="alert" className="text-sm font-semibold text-rose-700">
        {S.loadFailed}
      </p>
    );
  return (
    <WritingRecordView
      chunks={load.chunks}
      facts={facts}
      drafts={drafts}
      boxHeight={boxHeight}
    />
  );
};
