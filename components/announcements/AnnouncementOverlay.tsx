/**
 * AnnouncementOverlay
 *
 * Listens to the Firestore `announcements` collection and renders any
 * announcement that is currently active and targeted at the current user's
 * building(s) as a floating widget overlay on top of the dashboard.
 *
 * Dismissal logic (per the AnnouncementDismissalType):
 *   'user'      – A dismiss button is shown. Click stores the dismissal in
 *                 localStorage keyed by `{id}_{activatedAt}`.
 *   'scheduled' – The overlay automatically disappears once the wall clock
 *                 passes the configured scheduledDismissalTime (checked
 *                 every 30 seconds).
 *   'duration'  – A countdown shows remaining time. The overlay hides after
 *                 dismissalDurationSeconds seconds from first appearance.
 *   'admin'     – No dismiss control is shown. The admin must deactivate the
 *                 announcement in Admin Settings → Announcements.
 *
 * Dismissals are persisted in localStorage so they survive a page reload.
 * The key format `{id}_{activatedAt}` means that if an admin re-activates an
 * announcement (bumping activatedAt), all users see it again.
 */

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  Suspense,
} from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { X, Bell, Lock } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { Announcement, WidgetData, WidgetConfig } from '@/types';
import { WIDGET_COMPONENTS } from '@/components/widgets/WidgetRegistry';
import { useWindowSize } from '@/hooks/useWindowSize';

const DISMISSALS_KEY = 'spart_announcement_dismissals';
const SCHEDULE_CHECK_INTERVAL_MS = 30_000;

type DismissalRecord = Record<string, number>; // epochKey -> timestamp dismissed

function getDismissals(): DismissalRecord {
  try {
    const raw = localStorage.getItem(DISMISSALS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DismissalRecord;
  } catch {
    return {};
  }
}

function saveDismissal(epochKey: string) {
  const record = getDismissals();
  record[epochKey] = Date.now();
  try {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(record));
  } catch {
    // localStorage full – not critical
  }
}

function isDismissed(a: Announcement): boolean {
  if (!a.activatedAt) return false;
  const key = `${a.id}_${a.activatedAt}`;
  const record = getDismissals();
  return !!record[key];
}

/** Parse "HH:MM" into minutes-since-midnight for comparison. */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Returns true when the announcement should currently be visible.
 * @param nowMins - current wall-clock time in minutes (hours * 60 + minutes),
 *                  passed explicitly so callers can include it in useMemo deps.
 */
function isScheduledTimeReached(a: Announcement, nowMins: number): boolean {
  // isActive acts as a master enable flag for all activation types.
  if (!a.isActive) return false;
  // Non-scheduled announcements are visible whenever they are active.
  if (a.activationType !== 'scheduled') return true;
  // Scheduled announcements become visible once the wall clock passes the configured activation time.
  if (!a.scheduledActivationTime) return false;
  return nowMins >= timeToMinutes(a.scheduledActivationTime);
}

/** Returns true when a scheduled-dismissal announcement has passed its dismissal time. */
function isScheduledDismissalPast(a: {
  dismissalType: string;
  scheduledDismissalTime?: string;
}): boolean {
  if (a.dismissalType !== 'scheduled' || !a.scheduledDismissalTime)
    return false;
  return currentMinutes() >= timeToMinutes(a.scheduledDismissalTime);
}

/** Loading fallback for Suspense-wrapped lazy widget components. */
const WidgetLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full w-full text-slate-400">
    <div className="animate-spin w-6 h-6 border-2 border-slate-300 border-t-brand-blue-primary rounded-full" />
  </div>
);

/**
 * Renders the widget content for a given announcement using the same
 * lazy-loaded component registry as the main dashboard.
 */
const AnnouncementWidgetContent: React.FC<{ announcement: Announcement }> = ({
  announcement,
}) => {
  // Only track viewport size when maximized (avoids extra resize listeners for windowed announcements)
  const { width, height } = useWindowSize(announcement.maximized);

  const WidgetComponent = WIDGET_COMPONENTS[announcement.widgetType];

  // For interactive widgets (e.g. poll), inject the announcement id into
  // the config so they can write responses to the correct Firestore path.
  const injectedConfig: WidgetConfig =
    announcement.widgetType === 'poll'
      ? ({
          ...announcement.widgetConfig,
          _announcementId: announcement.id,
        } as WidgetConfig)
      : (announcement.widgetConfig as WidgetConfig);

  const fakeWidget: WidgetData = {
    id: `announcement-${announcement.id}`,
    type: announcement.widgetType,
    x: 0,
    y: 0,
    w: announcement.maximized ? width : announcement.widgetSize.w,
    h: announcement.maximized ? height : announcement.widgetSize.h,
    z: 9990,
    flipped: false,
    minimized: false,
    maximized: announcement.maximized,
    config: injectedConfig,
  };

  if (!WidgetComponent) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Widget type &quot;{announcement.widgetType}&quot; is not renderable.
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ containerType: 'size' }}>
      <Suspense fallback={<WidgetLoadingFallback />}>
        <WidgetComponent widget={fakeWidget} />
      </Suspense>
    </div>
  );
};

/** A single announcement window. */
const AnnouncementWindow: React.FC<{
  announcement: Announcement;
  onDismiss: (id: string, activatedAt: number | null) => void;
}> = ({ announcement, onDismiss }) => {
  const isDuration = announcement.dismissalType === 'duration';
  const total = announcement.dismissalDurationSeconds ?? 60;
  // Initialize with the full duration so we can display it immediately
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    isDuration ? total : null
  );
  const [scheduledDismissed, setScheduledDismissed] = useState(false);
  // Mount timestamp recorded inside the effect (avoids impure Date.now() in render)
  const mountedAt = useRef<number>(0);

  // Stable primitives to avoid resetting countdown on unrelated Firestore updates
  const announcementId = announcement.id;
  const announcementActivatedAt = announcement.activatedAt;

  // Duration-based countdown: tick once per second via setInterval
  useEffect(() => {
    if (!isDuration) return;
    mountedAt.current = Date.now();

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - mountedAt.current) / 1000);
      const remaining = total - elapsed;
      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss(announcementId, announcementActivatedAt);
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [announcementId, announcementActivatedAt, isDuration, onDismiss, total]);

  // Scheduled dismissal check — deps are narrowed to the specific fields used so
  // unrelated Firestore updates (e.g. name/targeting changes) don't tear down
  // and recreate the interval or trigger a spurious immediate check().
  const dismissalType = announcement.dismissalType;
  const scheduledDismissalTime = announcement.scheduledDismissalTime;
  useEffect(() => {
    if (dismissalType !== 'scheduled') return;

    const check = () => {
      if (isScheduledDismissalPast({ dismissalType, scheduledDismissalTime })) {
        setScheduledDismissed(true);
        onDismiss(announcementId, announcementActivatedAt);
      }
    };

    check();
    const interval = setInterval(check, SCHEDULE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [
    dismissalType,
    scheduledDismissalTime,
    announcementId,
    announcementActivatedAt,
    onDismiss,
  ]);

  if (scheduledDismissed) return null;

  const isMaximized = announcement.maximized;

  const containerStyle: React.CSSProperties = isMaximized
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
      }
    : {
        position: 'relative',
        width: announcement.widgetSize.w,
        height: announcement.widgetSize.h + 48, // + header
        flexShrink: 0,
      };

  const headerStyle: React.CSSProperties = {
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    background: 'rgba(15,23,42,0.85)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    flexShrink: 0,
  };

  const contentHeight = isMaximized
    ? 'calc(100% - 48px)'
    : announcement.widgetSize.h;

  const headingId = `announcement-heading-${announcement.id}`;

  return (
    <div
      className={`rounded-2xl overflow-hidden shadow-2xl border border-white/20 flex flex-col ${
        isMaximized ? 'fixed inset-0 rounded-none' : ''
      }`}
      style={isMaximized ? { zIndex: 9990 } : containerStyle}
      role="dialog"
      aria-modal={isMaximized ? 'true' : undefined}
      aria-labelledby={headingId}
    >
      {/* Header bar */}
      <div style={headerStyle}>
        <div className="flex items-center gap-2 text-white/90 min-w-0">
          <Bell className="w-4 h-4 shrink-0 text-yellow-400" />
          <span id={headingId} className="text-sm font-semibold truncate">
            {announcement.name}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Duration countdown chip */}
          {announcement.dismissalType === 'duration' &&
            secondsLeft !== null && (
              <span
                className="text-xs font-mono bg-white/10 text-white/80 px-2 py-0.5 rounded-full"
                aria-live="polite"
                aria-label={`Closes in ${secondsLeft} seconds`}
              >
                {secondsLeft}s
              </span>
            )}

          {/* Admin-only lock indicator */}
          {announcement.dismissalType === 'admin' && (
            <span
              title="Only an admin can close this announcement"
              className="flex items-center gap-1 text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded-full"
            >
              <Lock className="w-3 h-3" aria-hidden="true" />
              Admin only
            </span>
          )}

          {/* Dismiss button (user-dismissable only) */}
          {announcement.dismissalType === 'user' && (
            <button
              onClick={() =>
                onDismiss(announcement.id, announcement.activatedAt)
              }
              aria-label={`Dismiss announcement: ${announcement.name}`}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white/80 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Widget content */}
      <div
        className="bg-slate-900 overflow-hidden"
        style={{ height: contentHeight, flex: isMaximized ? '1' : undefined }}
      >
        <AnnouncementWidgetContent announcement={announcement} />
      </div>
    </div>
  );
};

/**
 * Top-level overlay container. Renders all active, visible announcements
 * as floating windows above the dashboard.
 */
export const AnnouncementOverlay: React.FC = () => {
  const { user, selectedBuildings } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    // Pre-populate from localStorage on mount
    const rec = getDismissals();
    return new Set(Object.keys(rec));
  });
  // Current wall-clock time in minutes, updated every SCHEDULE_CHECK_INTERVAL_MS
  // so scheduled activation/dismissal logic in useMemo re-runs automatically.
  const [nowMinutes, setNowMinutes] = useState(currentMinutes);

  // Subscribe to the announcements collection (only active announcements)
  useEffect(() => {
    // We only subscribe if we have a user object.
    // isAuthBypass allows the UI to render, but Firestore still needs an auth token
    // unless the rules are set to allow public read (which they are not).
    if (!user) return;

    const unsub = onSnapshot(
      query(collection(db, 'announcements'), where('isActive', '==', true)),
      (snap) => {
        const items: Announcement[] = [];
        snap.forEach((d) =>
          items.push({ id: d.id, ...d.data() } as Announcement)
        );
        setAnnouncements(items);
      },
      (err) => {
        console.error('[AnnouncementOverlay] Firestore error:', err);
      }
    );
    return unsub;
  }, [user]);

  // Periodic clock update for scheduled activation/dismissal checks
  useEffect(() => {
    const interval = setInterval(
      () => setNowMinutes(currentMinutes()),
      SCHEDULE_CHECK_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = useCallback(
    (id: string, activatedAt: number | null) => {
      const key = `${id}_${activatedAt}`;
      saveDismissal(key);
      setDismissed((prev) => new Set([...prev, key]));
    },
    []
  );

  // Determine which announcements are visible to this user.
  // nowMinutes is the current wall-clock time (minutes since midnight) and
  // is updated every SCHEDULE_CHECK_INTERVAL_MS so scheduled announcements
  // appear/disappear without a full re-subscribe.
  const visible = useMemo(
    () =>
      announcements.filter((a) => {
        // Must pass scheduled/manual activation check
        if (!isScheduledTimeReached(a, nowMinutes)) return false;

        // Must not have been dismissed by this user in this push epoch
        const epochKey = `${a.id}_${a.activatedAt}`;
        if (dismissed.has(epochKey) || isDismissed(a)) return false;

        // Check building targeting (empty targetBuildings = all users see it)
        if (a.targetBuildings.length > 0) {
          // User has no building configured — do not show targeted announcements
          if (selectedBuildings.length === 0) return false;
          // User has buildings — check for overlap with announcement targets
          const hasOverlap = a.targetBuildings.some((b) =>
            selectedBuildings.includes(b)
          );
          if (!hasOverlap) return false;
        }

        return true;
      }),
    [announcements, dismissed, selectedBuildings, nowMinutes]
  );

  if (visible.length === 0) return null;

  // Separate maximized from windowed
  const maximized = visible.filter((a) => a.maximized);
  const windowed = visible.filter((a) => !a.maximized);

  return (
    <>
      {/* Maximized announcements render over everything */}
      {maximized.map((a) => (
        <AnnouncementWindow
          key={`${a.id}_${a.activatedAt}`}
          announcement={a}
          onDismiss={handleDismiss}
        />
      ))}

      {/* Windowed announcements stack in the bottom-center */}
      {windowed.length > 0 && (
        <div
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[9985] flex flex-wrap justify-center gap-4 pointer-events-none"
          aria-live="polite"
        >
          {windowed.map((a) => (
            <div
              key={`${a.id}_${a.activatedAt}`}
              className="pointer-events-auto"
            >
              <AnnouncementWindow announcement={a} onDismiss={handleDismiss} />
            </div>
          ))}
        </div>
      )}
    </>
  );
};
