// The side panel's Focus tab (CHROME_EXTENSION.md F8, F12): start a session on this tab's site and run the teacher's sessions.
import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  chromeMuted,
  focusRing,
  iconBtn,
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import {
  FOCUS_EXTEND_MINUTES,
  FOCUS_MAX_SITES,
  type FocusPanelListReply,
  type FocusPanelRequest,
  type FocusPanelSession,
  type FocusSite,
  type FocusStartReply,
} from '@/utils/focus/contract';
import { parseFocusSite } from '@/utils/focus/allowlist';
import type { ApiFailure } from '../spartboardApi';
import {
  minutesLeft,
  siteForTab,
  siteLabel,
  type FocusPanelReply,
} from '../focus/panelMessages';
import { useActiveTab } from './ToursTab';

const LENGTHS = [10, 15, 20, 30, 45, 60];
const DEFAULT_LENGTH = 30;
const TICK_MS = 15_000;
const REFRESH_MS = 60_000;
const ARM_MS = 5_000;

const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const disabledLook = 'disabled:cursor-not-allowed disabled:opacity-50';

export const FOCUS_FAILURE_TEXT: Record<ApiFailure, string> = {
  'signed-out': 'Sign in to Chrome with your Orono account to use Focus.',
  'no-access': "Focus isn't available for your account yet.",
  'not-set-up': "Focus isn't set up yet.",
  'not-found': 'That session has ended.',
  offline:
    "Focus couldn't reach SpartBoard. Check your connection and try again.",
};

export const failureText = (r: { why: ApiFailure; message?: string }) =>
  r.message ?? FOCUS_FAILURE_TEXT[r.why];

export const sendFocus = async (
  body: FocusPanelRequest
): Promise<FocusPanelReply> => {
  try {
    const reply: FocusPanelReply | undefined = await chrome.runtime.sendMessage(
      { type: 'focus/panel', body }
    );
    return reply ?? { ok: false, why: 'offline' };
  } catch {
    return { ok: false, why: 'offline' };
  }
};

/** Why a typed site was refused, in the teacher's terms. */
function typedSiteError(text: string): string {
  if (
    /^(https?:\/\/)?(drive|docs)\.google\.com\/(open|uc)\b/i.test(text.trim())
  )
    return "That link doesn't name one file. Paste the file's own link instead.";
  return "That isn't a web address.";
}

const SessionRow: React.FC<{
  session: FocusPanelSession;
  now: number;
  busy: string | null;
  armed: string | null;
  onAct: (action: 'extend' | 'release' | 'end', s: FocusPanelSession) => void;
}> = ({ session, now, busy, armed, onAct }) => {
  const [first, ...rest] = session.sites;
  const sites = first
    ? `${siteLabel(first)}${rest.length ? ` and ${rest.length} more` : ''}`
    : '';
  const disabled = busy !== null;
  const label = (action: string, text: string, ask = text) =>
    busy === `${action}:${session.sessionId}`
      ? 'Working...'
      : armed === `${action}:${session.sessionId}`
        ? ask
        : text;
  return (
    <li className={`flex flex-col gap-2 p-3 ${card}`}>
      <span className="min-w-0">
        <span className="block font-semibold [overflow-wrap:anywhere]">
          {session.className}
        </span>
        <span
          className={`block text-xs ${chromeMuted} [overflow-wrap:anywhere]`}
        >
          {minutesLeft(session.endsAt, now)} · {sites}
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`${secondaryBtn} ${disabledLook}`}
          disabled={disabled}
          aria-label={`Add ${FOCUS_EXTEND_MINUTES} minutes to ${session.className}`}
          onClick={() => onAct('extend', session)}
        >
          {label('extend', `+${FOCUS_EXTEND_MINUTES} min`)}
        </button>
        <button
          type="button"
          className={`${secondaryBtn} ${disabledLook}`}
          disabled={disabled}
          onClick={() => onAct('release', session)}
        >
          {label('release', 'Release all', 'Release everyone?')}
        </button>
        <button
          type="button"
          className={`${secondaryBtn} ${disabledLook}`}
          disabled={disabled}
          onClick={() => onAct('end', session)}
        >
          {label('end', 'End', 'End now?')}
        </button>
      </span>
    </li>
  );
};

export const FocusTab: React.FC<{
  list: FocusPanelListReply;
  onReload: () => Promise<void>;
}> = ({ list, onReload }) => {
  const tab = useActiveTab();
  const [classId, setClassId] = useState('');
  const [edited, setEdited] = useState<FocusSite[] | null>(null);
  const [typed, setTyped] = useState('');
  const [minutes, setMinutes] = useState(DEFAULT_LENGTH);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    // Catches up on sessions started or ended elsewhere since the panel opened.
    void onReload();
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const refresh = setInterval(() => void onReload(), REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [onReload]);

  // Until the teacher edits the list, it follows the tab they are on.
  const tabSite = siteForTab(tab?.url);
  const sites = edited ?? (tabSite ? [tabSite] : []);
  const chosen =
    list.classes.find((c) => c.classId === classId) ?? list.classes[0];
  const running = list.sessions.filter((s) => s.endsAt > now);

  const addTyped = () => {
    const site = parseFocusSite(typed);
    if (!site) {
      setError(typedSiteError(typed));
      return;
    }
    setError('');
    setTyped('');
    if (sites.some((s) => s.host === site.host && s.path === site.path)) return;
    setEdited([...sites, site]);
  };

  const run = async (key: string, body: FocusPanelRequest) => {
    setBusy(key);
    setError('');
    setNotice('');
    const reply = await sendFocus(body);
    if (!reply.ok) setError(failureText(reply));
    await onReload();
    setBusy(null);
    return reply;
  };

  const start = async () => {
    if (!chosen || sites.length === 0) return;
    const reply = await run('start', {
      action: 'start',
      classId: chosen.classId,
      className: chosen.name,
      minutes,
      sites,
    });
    if (!reply.ok) return;
    const { studentCount, otherSessionCount } = reply.value as FocusStartReply;
    setNotice(
      `Focus started for ${studentCount} ${studentCount === 1 ? 'student' : 'students'}.` +
        (otherSessionCount > 0
          ? ` ${otherSessionCount} will join when their other session ends.`
          : '')
    );
    setEdited(null);
  };

  // Release and End take a second press, since side panels may not show confirm dialogs.
  const act = (action: 'extend' | 'release' | 'end', s: FocusPanelSession) => {
    const key = `${action}:${s.sessionId}`;
    if (action !== 'extend' && armed !== key) {
      setArmed(key);
      setTimeout(() => setArmed((cur) => (cur === key ? null : cur)), ARM_MS);
      return;
    }
    setArmed(null);
    void run(key, { action, sessionId: s.sessionId });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-brand-red-primary">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-slate-700">
          {notice}
        </p>
      )}
      {list.canStart && (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="focus-start-heading"
        >
          <h2 id="focus-start-heading" className="text-sm font-semibold">
            Focus a class on this tab
          </h2>
          {list.classes.length === 0 ? (
            <p className={chromeMuted}>
              Add a ClassLink class in SpartBoard to focus it here.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Class</span>
                <select
                  className={`${inputLight} rounded-lg px-2 py-1.5 ${focusRing}`}
                  value={chosen?.classId ?? ''}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  {list.classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1">
                <span className="font-medium" id="focus-sites-label">
                  Sites students can open
                </span>
                {sites.length > 0 ? (
                  <ul
                    aria-labelledby="focus-sites-label"
                    className="divide-y divide-slate-200 border-y border-slate-200"
                  >
                    {sites.map((site) => (
                      <li
                        key={siteLabel(site)}
                        className="flex items-center gap-2 py-1"
                      >
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          {siteLabel(site)}
                        </span>
                        <button
                          type="button"
                          className={iconBtn}
                          aria-label={`Remove ${siteLabel(site)}`}
                          onClick={() =>
                            setEdited(sites.filter((s) => s !== site))
                          }
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={chromeMuted}>Add at least one site.</p>
                )}
                {sites.length < FOCUS_MAX_SITES && (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addTyped();
                    }}
                  >
                    <input
                      className={`${inputLight} min-w-0 flex-1 rounded-lg px-2 py-1.5 ${focusRing}`}
                      placeholder="Add a site, like desmos.com"
                      aria-label="Add a site"
                      value={typed}
                      maxLength={2000}
                      onChange={(e) => setTyped(e.target.value)}
                    />
                    <button
                      type="submit"
                      className={`${secondaryBtn} inline-flex items-center gap-1 ${disabledLook}`}
                      disabled={!typed.trim()}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add
                    </button>
                  </form>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Length</span>
                <select
                  className={`${inputLight} rounded-lg px-2 py-1.5 ${focusRing}`}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                >
                  {LENGTHS.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`${primaryBtn} self-start ${disabledLook}`}
                disabled={busy !== null || sites.length === 0 || !chosen}
                onClick={() => void start()}
              >
                {busy === 'start' ? 'Starting...' : 'Start focus'}
              </button>
            </>
          )}
        </section>
      )}
      {running.length > 0 && (
        <section
          className="flex flex-col gap-2"
          aria-labelledby="focus-running-heading"
        >
          <h2 id="focus-running-heading" className="text-sm font-semibold">
            Running now
          </h2>
          <ul className="flex flex-col gap-2">
            {running.map((s) => (
              <SessionRow
                key={s.sessionId}
                session={s}
                now={now}
                busy={busy}
                armed={armed}
                onAct={act}
              />
            ))}
          </ul>
          <p className={`text-xs ${chromeMuted}`}>
            Open the Focus widget in SpartBoard to see each student.
          </p>
        </section>
      )}
    </div>
  );
};
