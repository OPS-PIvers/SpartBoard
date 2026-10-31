import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import { FOCUS_RETENTION_DAYS } from '@/utils/focus/contract';
import {
  focusAwayMs,
  formatFocusDuration,
  isFocusSummary,
  type FocusSessionRow,
} from './focusWidgetState';
import { FOCUS_LEVEL_TEXT } from './focusLevels';
import type { FocusStudentRow } from './useFocusData';
import { FocusButton } from './ui';

const when = (ms: number) =>
  new Date(ms).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const lengthText = (s: FocusSessionRow) =>
  `${Math.max(1, Math.round(((s.endedAt ?? s.endsAt) - s.startedAt) / 60_000))} min`;

const Header: React.FC<{
  widgetId: string;
  title: string;
  onBack: () => void;
}> = ({ widgetId, title, onBack }) => (
  <div
    className="flex shrink-0 items-center border-b border-slate-200"
    style={{
      padding: `min(8px, 2cqmin) min(10px, 2.6cqmin)`,
      gap: 'min(6px, 1.6cqmin)',
    }}
  >
    <FocusButton
      size="sm"
      variant="ghost"
      icon={ArrowLeft}
      onClick={onBack}
      {...tourAttr('focus.past-back', widgetId)}
    >
      Back
    </FocusButton>
    <span
      className="min-w-0 truncate font-bold text-slate-800"
      style={{ fontSize: 'min(15px, 5cqmin)' }}
    >
      {title}
    </span>
  </div>
);

export const FocusPastList: React.FC<{
  widgetId: string;
  sessions: FocusSessionRow[];
  onOpen: (id: string) => void;
  onBack: () => void;
}> = ({ widgetId, sessions, onOpen, onBack }) => (
  <div className="flex h-full w-full flex-col">
    <Header widgetId={widgetId} title="Past sessions" onBack={onBack} />
    <div
      className="relative z-1 min-h-0 flex-1 overflow-y-auto"
      style={{ paddingBottom: 'max(16px, 3cqmin)' }}
    >
      <ul className="divide-y divide-slate-200">
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              className="flex w-full items-center text-left hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary"
              style={{
                padding: `min(8px, 2cqmin) min(15px, 3.6cqmin)`,
                gap: 'min(8px, 2cqmin)',
              }}
              {...tourAttr('focus.past-session', widgetId)}
            >
              <span className="min-w-0 flex-1">
                <span
                  className="block text-slate-800"
                  style={{ fontSize: 'min(15px, 4.8cqmin)' }}
                >
                  {when(s.startedAt)}
                </span>
                <span
                  className="block text-slate-600"
                  style={{ fontSize: 'min(15px, 4.6cqmin)' }}
                >
                  {FOCUS_LEVEL_TEXT[s.level].label} · {lengthText(s)} ·{' '}
                  {s.teacherName}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="shrink-0 text-slate-400"
                style={{
                  width: 'min(16px, 4.6cqmin)',
                  height: 'min(16px, 4.6cqmin)',
                }}
              />
            </button>
          </li>
        ))}
      </ul>
      <p
        className="text-slate-600"
        style={{
          fontSize: 'min(15px, 4.6cqmin)',
          padding: `min(8px, 2cqmin) min(15px, 3.6cqmin)`,
        }}
      >
        Past sessions are kept for {FOCUS_RETENTION_DAYS} days.
      </p>
    </div>
  </div>
);

export const FocusPastDetail: React.FC<{
  widgetId: string;
  session: FocusSessionRow;
  students: FocusStudentRow[];
  loading: boolean;
  nameOf: (uid: string) => string | null;
  hideNames: boolean;
  onBack: () => void;
}> = ({ widgetId, session, students, loading, nameOf, hideNames, onBack }) => {
  const rows = students
    .map((r) => {
      const d = r.doc;
      const summary = isFocusSummary(d);
      return {
        uid: r.uid,
        name: nameOf(r.uid) ?? 'Student',
        awayMs: summary
          ? d.awayMs
          : focusAwayMs(d, session.endedAt ?? session.endsAt),
        blocked: d.blockedTries ?? 0,
        connected: summary ? d.connected : d.lastReportAt !== null,
      };
    })
    .sort((a, b) => b.awayMs - a.awayMs || a.name.localeCompare(b.name));
  return (
    <div className="flex h-full w-full flex-col">
      <Header
        widgetId={widgetId}
        title={when(session.startedAt)}
        onBack={onBack}
      />
      <div
        className="relative z-1 min-h-0 flex-1 overflow-y-auto"
        style={{ paddingBottom: 'max(16px, 3cqmin)' }}
      >
        <p
          className="text-slate-600"
          style={{
            fontSize: 'min(15px, 4.6cqmin)',
            padding: `min(8px, 2cqmin) min(15px, 3.6cqmin) 0`,
          }}
        >
          {session.className} · {FOCUS_LEVEL_TEXT[session.level].label} ·{' '}
          {lengthText(session)}
        </p>
        {loading ? null : hideNames ? (
          <p
            className="text-slate-600"
            style={{
              fontSize: 'min(15px, 4.6cqmin)',
              padding: `min(8px, 2cqmin) min(15px, 3.6cqmin) 0`,
            }}
          >
            {[
              `${rows.filter((r) => r.connected).length} connected`,
              `${rows.filter((r) => r.awayMs > 0).length} away at some point`,
              `${rows.reduce((n, r) => n + r.blocked, 0)} blocked attempts`,
            ].join(' · ')}
            . Student names are hidden. Turn them back on in this widget’s
            settings.
          </p>
        ) : (
          <ul
            className="divide-y divide-slate-200"
            style={{ marginTop: 'min(4px, 1cqmin)' }}
          >
            {rows.map((r) => (
              <li
                key={r.uid}
                className="flex items-baseline justify-between"
                style={{
                  padding: `min(6px, 1.6cqmin) min(15px, 3.6cqmin)`,
                  gap: 'min(8px, 2cqmin)',
                }}
              >
                <span
                  className="min-w-0 truncate text-slate-800"
                  style={{ fontSize: 'min(15px, 4.8cqmin)' }}
                >
                  {r.name}
                </span>
                <span
                  className="shrink-0 text-slate-600"
                  style={{ fontSize: 'min(15px, 4.6cqmin)' }}
                >
                  {r.connected
                    ? [
                        r.awayMs > 0
                          ? `Away ${formatFocusDuration(r.awayMs)}`
                          : 'Never away',
                        r.blocked > 0 ? `${r.blocked} blocked` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Not connected'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
