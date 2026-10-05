// One real widget in DraggableWindow on fixtures at /widget-grader-dev (auth-bypass builds only), for the widget grader.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { disableNetwork } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { AuthContext } from '@/context/AuthContextValue';
import { DashboardContext } from '@/context/DashboardContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import {
  DEFAULT_GLOBAL_STYLE,
  type ClassRoster,
  type Dashboard,
  type LiveSession,
  type WidgetConfig,
  type WidgetData,
} from '@/types';
import { WIDGET_FIXTURES, UNSUPPORTED_FIXTURES } from './fixtures';
import { parseHarnessParams, type HarnessParams } from './harnessParams';
import { buildHarnessAuth, buildHarnessDashboard } from './harnessContexts';
import { seedFirestoreDocs } from './harnessSeed';
import { installGraderStatus } from './graderStatus';

export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;
const BOARD_BACKGROUND = 'bg-gradient-to-br from-slate-900 to-slate-700';
const ORIGIN = 120;
const GAP = 40;
const QUIET_MS = 250;
const SETTLE_TIMEOUT_MS = 4000;

const noop = (): void => undefined;
const resolved = (): Promise<void> => Promise.resolve();
const noSession = (): Promise<LiveSession> =>
  Promise.reject(new Error('Live sessions are off in the grader harness'));

const status = installGraderStatus();
// Fixtures stand in for Firestore; any listener a widget opens reads the empty local cache.
void disableNetwork(db);
const PARSED = parseHarnessParams(window.location.search);
if (PARSED.ok && PARSED.params.state === 'offline') {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => false,
  });
}

if (PARSED.ok) {
  seedFirestoreDocs(
    WIDGET_FIXTURES[PARSED.params.type]?.[PARSED.params.fixture].firestoreDocs
  );
}

const rostersFor = (
  params: HarnessParams,
  fixtureRosters: ClassRoster[]
): ClassRoster[] => {
  if (params.state === 'noRoster' || params.state === 'loading') return [];
  if (params.state === 'error') {
    return fixtureRosters.map((r) => ({
      ...r,
      students: [],
      loadError: 'Could not load the student list.',
    }));
  }
  return fixtureRosters;
};

const buildWidgets = (params: HarnessParams): WidgetData[] => {
  const fixture = WIDGET_FIXTURES[params.type]?.[params.fixture];
  const base = (WIDGET_DEFAULTS[params.type].config ?? {}) as Record<
    string,
    unknown
  >;
  const own = (fixture?.config ?? {}) as Record<string, unknown>;
  return Array.from({ length: params.count }, (_, i) => ({
    id: `grader-${params.type}-${i + 1}`,
    type: params.type,
    x: ORIGIN + i * (params.w + GAP),
    y: ORIGIN,
    w: params.w,
    h: params.h,
    z: i + 1,
    flipped: i === 0 && params.settingsOpen,
    maximized: i === 0 && params.maximized,
    // Only the first instance gets the fixture so R5 can check the second doesn't inherit it.
    customTitle: i === 0 ? (fixture?.customTitle ?? null) : null,
    config: structuredClone({
      ...base,
      ...(i === 0 ? own : {}),
    }) as WidgetConfig,
  }));
};

const useSettledSignal = (expected: number): boolean => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let quietTimer: number | undefined;
    let cancelled = false;
    const started = performance.now();
    const settled = (): boolean => {
      // Maximized and spotlighted windows portal to body, so look document-wide.
      const windows = document.querySelectorAll('[data-draggable-window]');
      return (
        windows.length >= expected &&
        !document.querySelector(
          '[data-draggable-window] .animate-spin.border-b-2.border-blue-600'
        )
      );
    };
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      observer.disconnect();
      status.ready = true;
      setReady(true);
    };
    const check = () => {
      window.clearTimeout(quietTimer);
      if (performance.now() - started > SETTLE_TIMEOUT_MS) {
        if (!settled())
          status.errors.push('Grader harness: widget never settled');
        finish();
        return;
      }
      quietTimer = window.setTimeout(() => {
        if (settled()) void document.fonts.ready.then(finish);
        else check();
      }, QUIET_MS);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    check();
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(quietTimer);
    };
  }, [expected]);
  return ready;
};

const HarnessBoard: React.FC<{ params: HarnessParams }> = ({ params }) => {
  const [widgets, setWidgets] = useState<WidgetData[]>(() =>
    buildWidgets(params)
  );
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
    params.selected ? `grader-${params.type}-1` : null
  );
  const ready = useSettledSignal(params.count);

  const updateWidget = useCallback(
    (id: string, updates: Partial<WidgetData>) => {
      setWidgets((current) =>
        current.map((w) =>
          w.id === id
            ? {
                ...w,
                ...updates,
                config: updates.config
                  ? { ...w.config, ...updates.config }
                  : w.config,
              }
            : w
        )
      );
    },
    []
  );
  const removeWidget = useCallback((id: string) => {
    setWidgets((current) => current.filter((w) => w.id !== id));
  }, []);
  const bringToFront = useCallback((id: string) => {
    setWidgets((current) => {
      const top = Math.max(...current.map((w) => w.z));
      return current.map((w) =>
        w.id === id && w.z < top ? { ...w, z: top + 1 } : w
      );
    });
  }, []);

  const rosters = useMemo(
    () =>
      rostersFor(
        params,
        WIDGET_FIXTURES[params.type]?.[params.fixture].rosters ?? []
      ),
    [params]
  );
  const dashboard = useMemo<Dashboard>(
    () => ({
      id: 'grader-board',
      name: 'Grader board',
      background: BOARD_BACKGROUND,
      widgets,
      globalStyle: DEFAULT_GLOBAL_STYLE,
      createdAt: 0,
      viewportWidth: BOARD_WIDTH,
      viewportHeight: BOARD_HEIGHT,
    }),
    [widgets]
  );
  const dashboardValue = useMemo(
    () =>
      buildHarnessDashboard({
        dashboard,
        rosters,
        loading: params.state === 'loading',
        selectedWidgetId,
        setSelectedWidgetId,
        updateWidget,
        removeWidget,
        bringToFront,
      }),
    [
      dashboard,
      rosters,
      params.state,
      selectedWidgetId,
      updateWidget,
      removeWidget,
      bringToFront,
    ]
  );

  return (
    <DashboardContext.Provider value={dashboardValue}>
      <div
        className={`relative overflow-hidden ${BOARD_BACKGROUND}`}
        style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}
        data-grader-board=""
        data-grader-ready={ready ? 'true' : 'false'}
        data-grader-type={params.type}
        data-grader-fixture={params.fixture}
      >
        {widgets.map((widget) => (
          <WidgetRenderer
            key={widget.id}
            widget={widget}
            isLive={false}
            students={[]}
            updateSessionConfig={resolved}
            updateSessionBackground={resolved}
            startSession={noSession}
            endSession={resolved}
            removeStudent={resolved}
            toggleFreezeStudent={resolved}
            toggleGlobalFreeze={resolved}
            updateWidget={updateWidget}
            removeWidget={removeWidget}
            duplicateWidget={noop}
            bringToFront={bringToFront}
            addToast={noop}
            globalStyle={DEFAULT_GLOBAL_STYLE}
            dashboardBackground={BOARD_BACKGROUND}
            dashboardSettings={dashboard.settings}
          />
        ))}
      </div>
    </DashboardContext.Provider>
  );
};

const HarnessMessage: React.FC<{ text: string }> = ({ text }) => {
  useEffect(() => {
    status.errors.push(`Grader harness: ${text}`);
    status.ready = true;
  }, [text]);
  return (
    <div
      className="p-6 text-sm text-slate-700"
      data-grader-ready="true"
      data-grader-error=""
    >
      {text}
    </div>
  );
};

export const WidgetGraderHarness: React.FC = () => {
  if (!PARSED.ok) return <HarnessMessage text={PARSED.error} />;
  const { params } = PARSED;
  const authValue = buildHarnessAuth(
    WIDGET_FIXTURES[params.type]?.[params.fixture].auth
  );
  const unsupported = UNSUPPORTED_FIXTURES[params.type];
  if (unsupported)
    return (
      <HarnessMessage
        text={`${params.type} is not supported: ${unsupported}`}
      />
    );
  if (!WIDGET_FIXTURES[params.type])
    return <HarnessMessage text={`${params.type} has no fixtures yet`} />;
  return (
    <AuthContext.Provider value={authValue}>
      <DialogProvider>
        <HarnessBoard params={params} />
        <DialogContainer />
      </DialogProvider>
    </AuthContext.Provider>
  );
};
