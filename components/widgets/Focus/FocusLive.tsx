import React, { useState } from 'react';
import { Clock, Plus, Square, UserCheck } from 'lucide-react';
import {
  FOCUS_EXTEND_MINUTES,
  FOCUS_MAX_SITES,
  type FocusSite,
} from '@/utils/focus/contract';
import { tourAttr } from '@/config/tourAnchors';
import {
  compareFocusRows,
  focusCounts,
  focusMinutesLeft,
  focusRowStatus,
  focusSiteLabel,
  formatFocusDuration,
  isFocusSummary,
  type FocusRowStatus,
  type FocusSessionRow,
} from './focusWidgetState';
import type { FocusStudentRow } from './useFocusData';
import { FOCUS_LEVEL_TEXT } from './focusLevels';
import { SiteInput } from './SiteInput';
import { FocusButton } from './ui';

const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function statusText(s: FocusRowStatus): string {
  switch (s.kind) {
    case 'on-task':
      return 'On task';
    case 'away':
      return `Away ${formatFocusDuration(s.awayMs)}`;
    case 'connecting':
      return 'Connecting';
    case 'not-connected':
      return 'Not connected';
    case 'released':
      return 'Released';
    case 'other-session':
      return s.endsAt
        ? `In another focus session until ${clockTime(s.endsAt)}`
        : 'In another focus session';
  }
}

const STATUS_TONE: Record<FocusRowStatus['kind'], string> = {
  'on-task': 'text-emerald-800',
  away: 'text-amber-900 font-bold',
  connecting: 'text-slate-600',
  'not-connected': 'text-red-800',
  released: 'text-slate-600',
  'other-session': 'text-slate-600',
};

export interface FocusLiveActions {
  extend: () => Promise<void>;
  release: (studentUid?: string) => Promise<void>;
  /** Resolves false when the server refused the site, so the typed text stays. */
  addSite: (site: FocusSite) => Promise<boolean>;
  end: () => Promise<void>;
}

/** The running session: time left, the roster and the F8 controls. A sub sees Release class and End only. */
export const FocusLive: React.FC<{
  widgetId: string;
  session: FocusSessionRow;
  students: FocusStudentRow[];
  nameOf: (uid: string) => string | null;
  /** Names come from the teacher's ClassLink lookup; a sub sees counts only. */
  isSub: boolean;
  now: number;
  busy: string | null;
  error: string | null;
  actions: FocusLiveActions;
  /** A small window shows time left, the counts and End only. */
  compact?: boolean;
  /** Maximized: larger type for showing on a projector. */
  presenting?: boolean;
  /** The teacher turned names off in settings; the face shows counts only. */
  hideNames?: boolean;
  /** A wide, short window puts the header and buttons in a side column so the roster keeps its height. */
  wide?: boolean;
}> = ({
  widgetId,
  session,
  students,
  nameOf,
  isSub,
  now,
  busy,
  error,
  actions,
  compact = false,
  presenting = false,
  hideNames = false,
  wide = false,
}) => {
  const [addingSite, setAddingSite] = useState(false);
  // One tab stop for the roster; arrow keys move between its Release buttons.
  const [rovingUid, setRovingUid] = useState<string | null>(null);
  const rows = students
    .flatMap((r) => (isFocusSummary(r.doc) ? [] : [{ uid: r.uid, doc: r.doc }]))
    .map((r) => ({
      uid: r.uid,
      name: nameOf(r.uid) ?? 'Student',
      status: focusRowStatus(r.doc, session.startedAt, now),
      blocked: r.doc.blockedTries ?? 0,
      liveHost: r.doc.liveHost ?? null,
    }))
    .sort(compareFocusRows);
  const counts = focusCounts(rows.map((r) => r.status));
  const left = focusMinutesLeft(session.endsAt, now);
  const releasable = rows.filter(
    (r) => r.status.kind !== 'released' && r.status.kind !== 'other-session'
  );
  const active = releasable.length;
  const tabUid = releasable.some((r) => r.uid === rovingUid)
    ? rovingUid
    : (releasable[0]?.uid ?? null);
  const onRosterKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key) || releasable.length === 0) return;
    e.preventDefault();
    const at = releasable.findIndex((r) => r.uid === tabUid);
    const last = releasable.length - 1;
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? last
          : Math.min(last, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)));
    const uid = releasable[next].uid;
    setRovingUid(uid);
    e.currentTarget
      .querySelector<HTMLButtonElement>(
        `[data-release-uid="${CSS.escape(uid)}"]`
      )
      ?.focus();
  };
  const body = presenting ? 'min(22px, 4.6cqmin)' : 'min(15px, 4.6cqmin)';
  const name = presenting ? 'min(24px, 4.8cqmin)' : 'min(15px, 4.8cqmin)';

  const summary = [
    `${counts.onTask} on task`,
    `${counts.away} away`,
    `${counts.notConnected} not connected`,
    counts.connecting ? `${counts.connecting} connecting` : null,
    counts.released ? `${counts.released} released` : null,
    counts.otherSession ? `${counts.otherSession} in another session` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (compact) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center text-center"
        style={{ padding: 'min(10px, 4cqmin)', gap: 'min(6px, 2.5cqmin)' }}
      >
        <div
          className="font-black tabular-nums leading-none text-slate-800"
          style={{ fontSize: '24cqmin' }}
          aria-label={`${left} ${left === 1 ? 'minute' : 'minutes'} left`}
        >
          {left}
          <span
            className="font-semibold text-slate-600"
            style={{ fontSize: '9cqmin' }}
          >
            {' '}
            min
          </span>
        </div>
        <p
          className="text-slate-700"
          style={{ fontSize: 'max(12px, 9cqmin)' }}
          aria-live="polite"
        >
          {counts.away > 0
            ? `${counts.away} away · ${counts.onTask} on task`
            : `${counts.onTask} on task`}
        </p>
        {error && (
          <p
            role="alert"
            className="text-red-700"
            style={{ fontSize: 'max(11px, 7cqmin)' }}
          >
            {error}
          </p>
        )}
        <FocusButton
          variant="danger"
          icon={Square}
          disabled={!!busy}
          onClick={() => void actions.end()}
          style={{ fontSize: '8cqmin', minHeight: 'max(32px, 18cqmin)' }}
          {...tourAttr('focus.end', widgetId)}
        >
          End
        </FocusButton>
      </div>
    );
  }

  const header = (
    <div
      className={`shrink-0 ${wide ? '' : 'border-b border-slate-200'}`}
      style={{ padding: `min(10px, 2.6cqmin) min(15px, 3.6cqmin)` }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <div className="min-w-[0]">
          <div
            className="truncate font-bold text-slate-800"
            style={{
              fontSize: presenting
                ? 'min(32px, 5.4cqmin)'
                : 'min(16px, 5.4cqmin)',
            }}
          >
            {session.className}
          </div>
          <div className="text-slate-600" style={{ fontSize: body }}>
            {FOCUS_LEVEL_TEXT[session.level].label} · ends{' '}
            {clockTime(session.endsAt)}
          </div>
        </div>
        <div
          className="shrink-0 text-right font-black tabular-nums text-slate-800"
          style={{
            fontSize: presenting ? 'min(96px, 12cqmin)' : 'min(40px, 9cqmin)',
          }}
          aria-label={`${left} ${left === 1 ? 'minute' : 'minutes'} left`}
        >
          {left}
          <span
            className="font-semibold text-slate-600"
            style={{ fontSize: body }}
          >
            {' '}
            min left
          </span>
        </div>
      </div>
      <p
        className="text-slate-700"
        style={{
          fontSize: body,
          marginTop: 'min(6px, 1.6cqmin)',
        }}
        aria-live="polite"
      >
        {summary}
      </p>
    </div>
  );
  const footer = (
    <div
      className={`shrink-0 ${wide ? '' : 'border-t border-slate-200'}`}
      style={{ padding: `min(10px, 2.6cqmin) min(15px, 3.6cqmin)` }}
    >
      {error && (
        <p
          role="alert"
          className="text-red-700"
          style={{
            fontSize: 'min(15px, 4.6cqmin)',
            marginBottom: 'min(6px, 1.6cqmin)',
          }}
        >
          {error}
        </p>
      )}
      <div
        className={`flex flex-wrap items-center ${wide ? 'justify-start' : 'justify-end'}`}
        style={{ gap: 'min(6px, 1.6cqmin)' }}
      >
        {!isSub && (
          <FocusButton
            variant="secondary"
            icon={Clock}
            size={presenting ? 'lg' : 'md'}
            disabled={!!busy}
            onClick={() => void actions.extend()}
            {...tourAttr('focus.extend', widgetId)}
          >
            {busy === 'extend'
              ? 'Adding time…'
              : `+${FOCUS_EXTEND_MINUTES} min`}
          </FocusButton>
        )}
        <FocusButton
          variant="secondary"
          icon={UserCheck}
          size={presenting ? 'lg' : 'md'}
          disabled={!!busy || active === 0}
          onClick={() => void actions.release()}
          {...tourAttr('focus.release-class', widgetId)}
        >
          {busy === 'release' ? 'Releasing…' : 'Release class'}
        </FocusButton>
        <FocusButton
          variant="danger"
          icon={Square}
          size={presenting ? 'lg' : 'md'}
          disabled={!!busy}
          onClick={() => void actions.end()}
          {...tourAttr('focus.end', widgetId)}
        >
          End
        </FocusButton>
      </div>
    </div>
  );
  const roster = (
    <div
      className="relative z-[1] min-h-[0] flex-1 overflow-y-auto"
      style={{ paddingBottom: 'max(16px, 3cqmin)' }}
    >
      {isSub || hideNames ? (
        <p
          className="text-slate-600"
          style={{
            fontSize: body,
            padding: `min(10px, 2.6cqmin) min(15px, 3.6cqmin)`,
          }}
        >
          {isSub
            ? "Student names show only on the teacher's account. You can release the class or end the session."
            : 'Student names are hidden. Turn them back on in this widget’s settings.'}
        </p>
      ) : (
        <ul
          className="grid"
          aria-label="Students"
          onKeyDown={onRosterKey}
          style={{
            gridTemplateColumns: presenting
              ? 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))'
              : 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
          }}
        >
          {rows.map((r) => (
            <li
              key={r.uid}
              className="flex items-center border-b border-slate-200"
              style={{
                padding: `min(6px, 1.6cqmin) min(15px, 3.6cqmin)`,
                gap: 'min(8px, 2cqmin)',
              }}
            >
              <div className="min-w-[0] flex-1">
                <div
                  className="truncate text-slate-800"
                  style={{ fontSize: name }}
                >
                  {r.name}
                </div>
                <div style={{ fontSize: body }}>
                  <span className={STATUS_TONE[r.status.kind]}>
                    {statusText(r.status)}
                  </span>
                  {r.blocked > 0 && (
                    <span className="text-slate-600">
                      {' · '}
                      {r.blocked} blocked
                    </span>
                  )}
                  {r.liveHost && (
                    <span className="text-slate-600">
                      {' · '}
                      {r.liveHost}
                    </span>
                  )}
                </div>
              </div>
              {r.status.kind !== 'released' &&
                r.status.kind !== 'other-session' && (
                  <FocusButton
                    size={presenting ? 'lg' : 'sm'}
                    variant="ghost"
                    disabled={!!busy}
                    tabIndex={r.uid === tabUid ? 0 : -1}
                    data-release-uid={r.uid}
                    onFocus={() => setRovingUid(r.uid)}
                    aria-label={`Release ${r.name}`}
                    onClick={() => void actions.release(r.uid)}
                    {...tourAttr('focus.release-student', widgetId)}
                  >
                    {busy === `release:${r.uid}` ? 'Releasing…' : 'Release'}
                  </FocusButton>
                )}
            </li>
          ))}
        </ul>
      )}
      {!isSub && (
        <div style={{ padding: `min(8px, 2cqmin) min(15px, 3.6cqmin) 0` }}>
          <div className="text-slate-600" style={{ fontSize: body }}>
            Allowed: {session.sites.map(focusSiteLabel).join(', ')}
          </div>
          {addingSite ? (
            <div style={{ marginTop: 'min(6px, 1.6cqmin)' }}>
              <SiteInput
                widgetId={widgetId}
                live
                label="Add a site for everyone"
                disabled={!!busy}
                fullMessage={
                  session.sites.length >= FOCUS_MAX_SITES
                    ? `A session allows up to ${FOCUS_MAX_SITES} sites.`
                    : null
                }
                onAdd={async (site) => {
                  const ok = await actions.addSite(site);
                  if (ok) setAddingSite(false);
                  return ok;
                }}
              />
            </div>
          ) : (
            <FocusButton
              size={presenting ? 'lg' : 'sm'}
              variant="ghost"
              icon={Plus}
              style={{
                marginTop: 'min(4px, 1cqmin)',
                marginLeft: `calc(-1 * min(8px, 2.4cqmin))`,
              }}
              onClick={() => setAddingSite(true)}
              {...tourAttr('focus.open-add-site', widgetId)}
            >
              Add a site
            </FocusButton>
          )}
        </div>
      )}
    </div>
  );

  if (wide) {
    return (
      <div className="flex h-full w-full">
        <div
          className="flex shrink-0 flex-col justify-between border-r border-slate-200"
          style={{ width: 'min(380px, 34%)' }}
        >
          {header}
          {footer}
        </div>
        <div className="flex min-w-[0] flex-1 flex-col">{roster}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {header}
      {roster}
      {footer}
    </div>
  );
};
