/**
 * MobileRemoteView
 *
 * A mobile-optimised teacher remote for the active dashboard.
 * Renders interactive widgets as swipeable full-screen cards so the
 * teacher can control timers, scoreboards, dice etc. from their phone
 * while the desktop board stays visible to students.
 *
 * Architecture — write-through, snapshot-based:
 *   • On mount (and on manual Sync) the component takes a point-in-time
 *     snapshot of the active dashboard from Firestore / DashboardContext.
 *   • All writes (updateWidget, updateDashboardSettings) are applied to
 *     the LOCAL snapshot immediately AND forwarded to Firestore via the
 *     context so the desktop sees them in real-time.
 *   • The component intentionally does NOT react to Firestore snapshots
 *     after the initial load.  This prevents the stale-data revert problem
 *     where Firestore echoes an old state back and overwrites the user's
 *     in-progress changes on the remote.
 *   • Pressing the Sync button re-reads the latest state from the context
 *     (which itself is always up-to-date from Firestore) so the teacher
 *     can pull in any board changes made on the desktop.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, WidgetType, DashboardSettings } from '@/types';
import { RemoteWidgetCard } from './RemoteWidgetCard';

/** Widget types with full custom remote controls — sorted to the front of the carousel */
const REMOTE_SUPPORTED_TYPES: WidgetType[] = [
  'time-tool',
  'scoreboard',
  'dice',
  'random',
  'traffic',
  'clock',
  'checklist',
  'poll',
  'expectations',
  'schedule',
  'breathing',
  'music',
  'nextUp',
  'sound',
  'webcam',
];

/** Widget types that are always skipped on the remote (truly non-interactive) */
const REMOTE_SKIP_TYPES: WidgetType[] = [
  'sticker',
  'stickers',
  'drawing',
  'onboarding',
  'classes', // empty config, no remote actions
];

export const MobileRemoteView: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeDashboard,
    updateWidget: ctxUpdateWidget,
    updateDashboardSettings: ctxUpdateDashboardSettings,
    loadDashboard,
    dashboards,
  } = useDashboard();
  const { remoteControlEnabled: accountRemoteEnabled } = useAuth();

  // ---- Local snapshot state ----
  // Initialised once from activeDashboard, then only updated on manual Sync.
  // This prevents Firestore echo snapshots from reverting the remote UI.
  const [localWidgets, setLocalWidgets] = useState<WidgetData[] | null>(null);
  const [localSettings, setLocalSettings] = useState<
    DashboardSettings | undefined
  >(undefined);
  const [syncing, setSyncing] = useState(false);
  const [initializedDashboardId, setInitializedDashboardId] = useState<
    string | null
  >(null);

  // Tracks per-widget timer IDs for in-flight remote writes.
  // Using a Map (id → timerId) ensures a rapid second write to the same widget
  // cancels the first timer before starting a new one, preventing early removal.
  const pendingWidgetTimers = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  // Single resettable timer for in-flight settings writes.
  const pendingSettingsTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Board ID requested via URL query param (e.g. /remote?boardId=<id>).
  // If present, we switch to that board as soon as dashboards have loaded.
  const [targetBoardId] = useState(() =>
    new URLSearchParams(window.location.search).get('boardId')
  );
  const hasTargetedBoard = useRef(false);

  const clearPendingWriteGuards = useCallback(() => {
    pendingWidgetTimers.current.forEach((timer) => clearTimeout(timer));
    pendingWidgetTimers.current.clear();
    if (pendingSettingsTimer.current !== null) {
      clearTimeout(pendingSettingsTimer.current);
      pendingSettingsTimer.current = null;
    }
  }, []);

  // Clear all pending timers on unmount to prevent stale state updates.
  useEffect(() => clearPendingWriteGuards, [clearPendingWriteGuards]);

  // Switch to the board specified in the URL, once dashboards are available.
  useEffect(() => {
    if (!targetBoardId || hasTargetedBoard.current || dashboards.length === 0)
      return;
    if (activeDashboard?.id === targetBoardId) {
      hasTargetedBoard.current = true;
      return;
    }
    const target = dashboards.find((d) => d.id === targetBoardId);
    if (!target) return; // ID not found — fall back to default board
    hasTargetedBoard.current = true;
    loadDashboard(targetBoardId);
  }, [dashboards, activeDashboard, targetBoardId, loadDashboard]);

  // Seed local snapshot when activeDashboard first becomes available.
  // We do this in the render phase to avoid "cascading renders" from useEffect.
  // React allows setting state during render as long as it's guarded to prevent loops.
  if (activeDashboard && initializedDashboardId !== activeDashboard.id) {
    setInitializedDashboardId(activeDashboard.id);
    setLocalWidgets([...activeDashboard.widgets]);
    setLocalSettings(
      activeDashboard.settings ? { ...activeDashboard.settings } : undefined
    );
  }

  // Auto-sync from the desktop when activeDashboard changes (new Firestore snapshot).
  // Widgets with pending remote writes are kept at their local version to avoid
  // Firestore echo reversions; all other widgets receive the latest desktop state.
  useEffect(() => {
    if (!activeDashboard || initializedDashboardId !== activeDashboard.id) {
      return;
    }
    setLocalWidgets((prev) => {
      if (!prev) return [...activeDashboard.widgets];
      const prevMap = new Map(prev.map((w) => [w.id, w]));
      return activeDashboard.widgets.map((fw) => {
        if (pendingWidgetTimers.current.has(fw.id)) {
          return prevMap.get(fw.id) ?? fw;
        }
        return fw;
      });
    });
    if (pendingSettingsTimer.current === null) {
      setLocalSettings(
        activeDashboard.settings ? { ...activeDashboard.settings } : undefined
      );
    }
  }, [activeDashboard, initializedDashboardId]);

  // Manual sync — pull latest state from context and clear any pending write guards.
  const handleSync = useCallback(() => {
    if (!activeDashboard) return;
    setSyncing(true);
    clearPendingWriteGuards();
    setLocalWidgets([...activeDashboard.widgets]);
    setLocalSettings(
      activeDashboard.settings ? { ...activeDashboard.settings } : undefined
    );
    setTimeout(() => setSyncing(false), 600);
  }, [activeDashboard, clearPendingWriteGuards]);

  // Write-through updateWidget: update local snapshot AND write to Firestore.
  // Cancels any existing timer for this widget before starting a fresh one so
  // rapid successive writes don't clear the guard prematurely.
  const handleUpdateWidget = useCallback(
    (id: string, updates: Partial<WidgetData>) => {
      const existing = pendingWidgetTimers.current.get(id);
      if (existing !== undefined) clearTimeout(existing);
      pendingWidgetTimers.current.set(
        id,
        setTimeout(() => pendingWidgetTimers.current.delete(id), 5000)
      );
      setLocalWidgets((prev) => {
        if (!prev) return prev;
        return prev.map((w) => {
          if (w.id !== id) return w;
          return {
            ...w,
            ...updates,
            config: updates.config
              ? { ...w.config, ...updates.config }
              : w.config,
          };
        });
      });
      ctxUpdateWidget(id, updates);
    },
    [ctxUpdateWidget]
  );

  // Write-through updateDashboardSettings: update local snapshot AND write to Firestore.
  // Cancels any existing settings timer before starting a fresh one so rapid
  // successive settings writes don't clear the guard prematurely.
  const handleUpdateDashboardSettings = useCallback(
    (updates: Partial<DashboardSettings>) => {
      if (pendingSettingsTimer.current !== null) {
        clearTimeout(pendingSettingsTimer.current);
      }
      pendingSettingsTimer.current = setTimeout(() => {
        pendingSettingsTimer.current = null;
      }, 5000);
      setLocalSettings((prev) => ({ ...(prev ?? {}), ...updates }));
      ctxUpdateDashboardSettings(updates);
    },
    [ctxUpdateDashboardSettings]
  );

  // Reset local snapshot when switching dashboards so the new dashboard
  // seeds fresh state from the context.
  const handleLoadDashboard = useCallback(
    (id: string) => {
      setInitializedDashboardId(null);
      setLocalWidgets(null);
      setLocalSettings(undefined);
      loadDashboard(id);
    },
    [loadDashboard]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const remoteWidgets = React.useMemo(() => {
    if (!localWidgets) return [];
    return localWidgets
      .filter((w) => !REMOTE_SKIP_TYPES.includes(w.type))
      .sort((a, b) => {
        const aSupported = REMOTE_SUPPORTED_TYPES.includes(a.type) ? 0 : 1;
        const bSupported = REMOTE_SUPPORTED_TYPES.includes(b.type) ? 0 : 1;
        return aSupported - bSupported || b.z - a.z;
      });
  }, [localWidgets]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const safeIdx = Math.max(0, Math.min(index, remoteWidgets.length - 1));
      setCurrentIndex(safeIdx);
      el.scrollTo({ left: safeIdx * window.innerWidth, behavior: 'smooth' });
    },
    [remoteWidgets.length]
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / window.innerWidth);
    setCurrentIndex(idx);
  }, []);

  if (!activeDashboard || localWidgets === null) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
      </div>
    );
  }

  const remoteEnabled = accountRemoteEnabled;

  if (!remoteEnabled) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Smartphone className="w-12 h-12 text-white/20" />
        <p className="text-white/60 font-semibold">Remote Control Disabled</p>
        <p className="text-white/40 text-sm">
          Enable Remote Control from the Dock on your main board to start
          controlling widgets here.
        </p>
      </div>
    );
  }

  if (remoteWidgets.length === 0) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <LayoutGrid className="w-12 h-12 text-white/20" />
        <p className="text-white/60 font-semibold">
          {t('widgets.dashboard.emptyBoardHint')}
        </p>
        <p className="text-white/40 text-sm">
          Add widgets to your board to control them here.
        </p>
      </div>
    );
  }

  const dashboardIndex = dashboards.findIndex(
    (d) => d.id === activeDashboard.id
  );

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden select-none">
      {/* Top bar — Dashboard switcher + Sync */}
      <div
        className="flex items-center justify-between px-4 shrink-0 bg-slate-950/80 backdrop-blur-md border-b border-white/5"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)',
          paddingBottom: '0.5rem',
        }}
      >
        <button
          onClick={() => {
            if (dashboards.length > 1 && dashboardIndex > 0) {
              handleLoadDashboard(dashboards[dashboardIndex - 1].id);
              setCurrentIndex(0);
              if (scrollRef.current) scrollRef.current.scrollLeft = 0;
            }
          }}
          disabled={dashboardIndex <= 0}
          className="p-2 text-white/40 disabled:opacity-20 hover:text-white transition-colors"
          aria-label="Previous board"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center gap-0.5">
          <span className="text-white font-black text-sm truncate max-w-40">
            {activeDashboard.name}
          </span>
          <span className="text-white/40 text-xs">Remote Control</span>
        </div>

        {/* Sync button — manually pull the latest board state from Firestore */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="p-2 text-white/40 hover:text-white transition-colors disabled:opacity-40"
          aria-label="Sync board state"
          title="Sync — pull latest board state from the desktop"
        >
          <RefreshCw
            className={`w-5 h-5 ${syncing ? 'animate-spin text-blue-400' : ''}`}
          />
        </button>

        <button
          onClick={() => {
            if (
              dashboards.length > 1 &&
              dashboardIndex < dashboards.length - 1
            ) {
              handleLoadDashboard(dashboards[dashboardIndex + 1].id);
              setCurrentIndex(0);
              if (scrollRef.current) scrollRef.current.scrollLeft = 0;
            }
          }}
          disabled={dashboardIndex >= dashboards.length - 1}
          className="p-2 text-white/40 disabled:opacity-20 hover:text-white transition-colors"
          aria-label="Next board"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Swipeable Widget Carousel */}
      <div
        ref={scrollRef}
        className="flex-1 flex overflow-x-auto overflow-y-hidden"
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        }}
        onScroll={handleScroll}
      >
        {remoteWidgets.map((widget) => (
          <RemoteWidgetCard
            key={widget.id}
            widget={widget}
            dashboardSettings={localSettings}
            updateWidget={handleUpdateWidget}
            updateDashboardSettings={handleUpdateDashboardSettings}
          />
        ))}
      </div>

      {/* Bottom pagination dots */}
      {remoteWidgets.length > 1 && (
        <div
          className="flex items-center justify-center gap-1.5 shrink-0"
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)',
            paddingTop: '0.5rem',
          }}
        >
          {remoteWidgets.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className={`rounded-full transition-all ${
                i === currentIndex
                  ? 'bg-blue-400 w-5 h-2'
                  : 'bg-white/20 w-2 h-2 hover:bg-white/40'
              }`}
              aria-label={`Go to widget ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
