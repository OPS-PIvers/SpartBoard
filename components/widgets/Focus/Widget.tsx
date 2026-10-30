import React, { useContext, useEffect, useState } from 'react';
import { Crosshair, RefreshCw, Users } from 'lucide-react';
import type { FocusConfig, WidgetData } from '@/types';
import {
  useDashboardActions,
  useDashboardCanvasSelector,
} from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import {
  formatStudentName,
  useAssignmentPseudonymsMulti,
} from '@/hooks/useAssignmentPseudonyms';
import { tourAttr } from '@/config/tourAnchors';
import type { FocusSite } from '@/utils/focus/contract';
import {
  focusClassRosters,
  liveFocusSession,
  pastFocusSessions,
  rosterClassId,
} from './focusWidgetState';
import {
  focusApi,
  focusErrorMessage,
  isRunningConflict,
  useFocusClassSessions,
  useFocusOpen,
  useFocusSession,
  useFocusStudents,
} from './useFocusData';
import { FocusSetup } from './FocusSetup';
import { FocusLive, type FocusLiveActions } from './FocusLive';
import { FocusPastDetail, FocusPastList } from './FocusPast';
import { FocusButton } from './ui';
import { FocusFixtureNamesContext } from './fixtureNames';

/** Re-renders every `ms` so running times and minutes left stay current. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

const EMPTY_TONE = {
  iconClassName: 'text-slate-400',
  titleClassName: 'text-slate-700',
  subtitleClassName: 'text-slate-600',
  titleSize: 'min(15px, 5cqmin)',
  subtitleSize: 'min(15px, 5cqmin)',
};

/** Below this the roster and setup can't fit, so the face shows time left and End only. */
const isCompact = (w: WidgetData) => !w.maximized && (w.w < 200 || w.h < 260);

type View =
  { kind: 'main' } | { kind: 'past-list' } | { kind: 'past'; id: string };

export const FocusWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const subShare = useContext(SubShareContentContext);
  return subShare ? (
    <FocusSubView widget={widget} shareId={subShare.shareId} />
  ) : (
    <FocusTeacherView widget={widget} />
  );
};

/** Names for the class's pseudonym uids; the lookup is per class, so every session of a class shares it. */
function useFocusNames(classId: string | null, orgId: string | null) {
  const fixtureNames = useContext(FocusFixtureNamesContext);
  const { byStudentUid } = useAssignmentPseudonymsMulti(
    fixtureNames || !classId ? null : `focus:${classId}`,
    classId ? [classId] : null,
    orgId
  );
  if (fixtureNames) return (uid: string) => fixtureNames[uid] ?? null;
  return (uid: string) => formatStudentName(byStudentUid.get(uid)) || null;
}

const FocusTeacherView: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboardActions();
  const rosters = useDashboardCanvasSelector((s) => s.rosters);
  const boardWidgets = useDashboardCanvasSelector(
    (s) => s.activeDashboard?.widgets
  );
  const { user, orgId } = useAuth();
  const { showConfirm } = useDialog();
  const config = widget.config as FocusConfig;
  const classRosters = focusClassRosters(rosters ?? []);
  const roster = classRosters.find((r) => r.id === config.rosterId) ?? null;
  const classId = roster ? rosterClassId(roster) : null;
  const compact = isCompact(widget);

  const sessions = useFocusClassSessions(user?.uid, classId);
  const now = useNow(1000);
  const live = liveFocusSession(sessions.rows, now);
  const past = pastFocusSessions(sessions.rows, now);
  // A co-teacher's session shows up in the listener once the server adds them as a reader.
  const opener = useFocusOpen(classId, null, !sessions.loading && !live);
  const [view, setView] = useState<View>({ kind: 'main' });
  const pastSession =
    view.kind === 'past' ? (past.find((s) => s.id === view.id) ?? null) : null;
  const students = useFocusStudents(live?.id ?? pastSession?.id ?? null);
  const nameOf = useFocusNames(
    classId,
    live?.orgId ?? pastSession?.orgId ?? orgId
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ at: string; message: string } | null>(
    null
  );

  const update = (patch: Partial<FocusConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...patch } });

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      if (isRunningConflict(err)) opener.recheck();
      setError({
        at: live?.id ?? 'setup',
        message: focusErrorMessage(err),
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (classRosters.length === 0) {
    return (
      <ScaledEmptyState
        {...EMPTY_TONE}
        icon={Crosshair}
        title="No ClassLink classes"
        // A small window drops the sentence so the title and button stay readable.
        subtitle={
          compact
            ? undefined
            : 'Import a class from ClassLink in Classes to use Focus.'
        }
        titleSize={compact ? 'max(12px, 5cqmin)' : EMPTY_TONE.titleSize}
        action={
          <FocusButton
            size="sm"
            icon={Users}
            style={{
              marginTop: 'min(8px, 2cqmin)',
              ...(compact && { fontSize: 'max(12px, 5cqmin)' }),
            }}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('open-sidebar', {
                  detail: { section: 'classes' },
                })
              )
            }
            {...tourAttr('focus.open-classes', widget.id)}
          >
            Open Classes
          </FocusButton>
        }
      />
    );
  }

  if (live) {
    const actions: FocusLiveActions = {
      extend: async () => {
        await run('extend', () => focusApi.extend({ sessionId: live.id }));
      },
      release: async (studentUid) => {
        if (!studentUid) {
          const ok = await showConfirm(
            'Every student can leave focus. The session stays open until it ends.',
            { title: 'Release the class?', confirmLabel: 'Release class' }
          );
          if (!ok) return;
        }
        await run(studentUid ? `release:${studentUid}` : 'release', () =>
          focusApi.release(
            studentUid
              ? { sessionId: live.id, studentUid }
              : { sessionId: live.id }
          )
        );
      },
      addSite: (site: FocusSite) =>
        run('site', () => focusApi.addSite({ sessionId: live.id, site })),
      end: async () => {
        const ok = await showConfirm('Students leave focus right away.', {
          title: 'End the focus session?',
          confirmLabel: 'End session',
          variant: 'danger',
        });
        if (ok) await run('end', () => focusApi.end({ sessionId: live.id }));
      },
    };
    return (
      <FocusLive
        widgetId={widget.id}
        session={live}
        students={students.rows}
        nameOf={nameOf}
        isSub={false}
        now={now}
        busy={busy}
        error={error?.at === live.id ? error.message : null}
        actions={actions}
        compact={compact}
        presenting={!!widget.maximized}
        hideNames={!!config.hideNames}
        wide={!widget.maximized && widget.w >= widget.h * 2.2}
      />
    );
  }

  if (compact) {
    return (
      <ScaledEmptyState
        {...EMPTY_TONE}
        icon={Crosshair}
        title="Focus"
        subtitle="Make this widget bigger to set up a session."
      />
    );
  }

  if (view.kind === 'past' && pastSession) {
    return (
      <FocusPastDetail
        widgetId={widget.id}
        session={pastSession}
        students={students.rows}
        loading={students.loading}
        nameOf={nameOf}
        hideNames={!!config.hideNames}
        onBack={() => setView({ kind: 'past-list' })}
      />
    );
  }
  if (view.kind !== 'main' && past.length > 0) {
    return (
      <FocusPastList
        widgetId={widget.id}
        sessions={past}
        onOpen={(id) => setView({ kind: 'past', id })}
        onBack={() => setView({ kind: 'main' })}
      />
    );
  }

  return (
    <FocusSetup
      widget={widget}
      config={config}
      rosters={classRosters}
      boardWidgets={boardWidgets ?? []}
      onChange={update}
      starting={busy === 'start'}
      checking={opener.checking}
      error={
        error?.at === 'setup'
          ? error.message
          : sessions.error
            ? "Couldn't load this class's focus sessions."
            : null
      }
      pastCount={past.length}
      onOpenPast={() => setView({ kind: 'past-list' })}
      onStart={() => {
        if (!roster || !classId) return;
        void run('start', () =>
          focusApi.start({
            classId,
            className: roster.name,
            level: config.level ?? 'redirect',
            minutes: config.minutes ?? 30,
            sites: config.sites ?? [],
          })
        );
      }}
    />
  );
};

/** F8: a substitute with the teacher's shared board sees the class's running session and can release or end it. */
const FocusSubView: React.FC<{ widget: WidgetData; shareId: string }> = ({
  widget,
  shareId,
}) => {
  const { showConfirm } = useDialog();
  const config = widget.config as FocusConfig;
  const classId = config.classId ?? null;
  const opener = useFocusOpen(classId, shareId, true);
  const session = useFocusSession(opener.sessionId);
  const students = useFocusStudents(opener.sessionId);
  const now = useNow(1000);
  const live = liveFocusSession(session.rows, now);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!classId) {
    return (
      <ScaledEmptyState
        {...EMPTY_TONE}
        icon={Crosshair}
        title="No class picked"
        subtitle="The teacher hasn't picked a class for this Focus widget."
      />
    );
  }
  if (!live) {
    return (
      <ScaledEmptyState
        {...EMPTY_TONE}
        icon={Crosshair}
        title="No focus session running"
        subtitle={`When ${config.className ?? 'this class'} is in a focus session, you can release it or end it here.`}
        action={
          <FocusButton
            size="sm"
            icon={RefreshCw}
            disabled={opener.checking}
            onClick={opener.recheck}
            style={{ marginTop: 'min(8px, 2cqmin)' }}
            {...tourAttr('focus.sub-check', widget.id)}
          >
            {opener.checking ? 'Checking…' : 'Check again'}
          </FocusButton>
        }
      />
    );
  }

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(focusErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <FocusLive
      widgetId={widget.id}
      session={live}
      students={students.rows}
      nameOf={() => null}
      isSub
      now={now}
      busy={busy}
      error={error}
      compact={isCompact(widget)}
      presenting={!!widget.maximized}
      actions={{
        extend: () => Promise.resolve(),
        addSite: () => Promise.resolve(false),
        release: async () => {
          const ok = await showConfirm(
            'Every student can leave focus. The session stays open until it ends.',
            { title: 'Release the class?', confirmLabel: 'Release class' }
          );
          if (ok)
            await run('release', () =>
              focusApi.release({ sessionId: live.id, shareId })
            );
        },
        end: async () => {
          const ok = await showConfirm('Students leave focus right away.', {
            title: 'End the focus session?',
            confirmLabel: 'End session',
            variant: 'danger',
          });
          if (ok)
            await run('end', () =>
              focusApi.end({ sessionId: live.id, shareId })
            );
        },
      }}
    />
  );
};
