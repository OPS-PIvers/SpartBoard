import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Lock,
  MoreVertical,
  Unlock,
  XCircle,
} from 'lucide-react';
import type { VideoActivitySession } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useServerNow } from '@/hooks/useServerNow';
import {
  AwayNowChip,
  TabExitsPopover,
} from '@/components/common/TabExitsPopover';
import { tourAttr, tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { studentCanEnter } from '@/utils/periodAccess';
import {
  getEffectiveTabWarningThreshold,
  hasReachedTabWarningThreshold,
} from '@/utils/tabWarningThreshold';
import type { BucketKey } from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import type {
  MonitorFilterBy,
  MonitorSortBy,
} from '@/components/widgets/QuizWidget/components/monitor/monitorUtils';
import { VaMonitorStudent, vaRosterRows } from './vaMonitorData';

const TYPE = 'video-activity';

const fieldStyle = {
  fontSize: 'min(11px, 3.8cqmin)',
  padding: 'min(4px, 1cqmin) min(6px, 1.5cqmin)',
};
const iconSize = {
  width: 'min(12px, 4cqmin)',
  height: 'min(12px, 4cqmin)',
};
const markSize = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};

interface VaRosterListProps {
  bucket: BucketKey;
  students: VaMonitorStudent[];
  session: VideoActivitySession;
  showTabs: boolean;
  onToggleTabs: () => void;
  sortBy: MonitorSortBy;
  onSortBy: (v: MonitorSortBy) => void;
  filterBy: MonitorFilterBy;
  onFilterBy: (v: MonitorFilterBy) => void;
  onUnlock?: (key: string, name: string) => void;
  /** Per-period sessions: let one student in past their class's state. */
  onLetIn?: (studentUid: string) => void;
}

const isLocked = (s: VaMonitorStudent, session: VideoActivitySession) => {
  const r = s.response;
  if (r.unlocked) return false;
  const limit = session.sessionOptions?.attemptLimit;
  return (
    (s.bucket === 'done' &&
      hasReachedTabWarningThreshold(
        s.tabWarnings,
        getEffectiveTabWarningThreshold(
          session.sessionOptions?.tabWarningThreshold
        )
      )) ||
    (typeof limit === 'number' &&
      limit > 0 &&
      (r.completedAttempts ?? 0) >= limit)
  );
};

const RowMenu: React.FC<{
  student: VaMonitorStudent;
  locked: boolean;
  canLetIn: boolean;
  onUnlock?: (key: string, name: string) => void;
  onLetIn?: (studentUid: string) => void;
}> = ({ student, locked, canLetIn, onUnlock, onLetIn }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setOpen(false));
  const uid = student.response.studentUid;
  const items: {
    label: string;
    tour: ReturnType<typeof tourFieldAttr>;
    onClick: () => void;
  }[] = [];
  if (canLetIn && onLetIn)
    items.push({
      label: 'Let in now',
      tour: tourFieldAttr('video-activity.monitor-let-in', TYPE, uid),
      onClick: () => onLetIn(uid),
    });
  if (locked && onUnlock)
    items.push({
      label: 'Unlock attempt',
      tour: tourFieldAttr('video-activity.monitor-unlock', TYPE, uid),
      onClick: () => onUnlock(student.key, student.name),
    });
  if (items.length === 0) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for ${student.name}`}
        aria-expanded={open}
        {...tourFieldAttr('video-activity.monitor-row-actions', TYPE, uid)}
        className="rounded-md text-brand-gray-primary hover:bg-brand-gray-lightest hover:text-brand-blue-dark transition-colors"
        style={{ padding: 'min(4px, 1cqmin)' }}
      >
        <MoreVertical style={markSize} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 bg-white border border-brand-gray-lighter rounded-lg shadow-lg overflow-hidden"
          style={{
            marginTop: 'min(4px, 1cqmin)',
            minWidth: 'min(160px, 55cqw)',
          }}
        >
          {items.map((item) => (
            <button
              type="button"
              key={item.label}
              {...item.tour}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="block w-full text-left font-sans text-brand-gray-dark hover:bg-brand-blue-lighter transition-colors"
              style={{
                fontSize: 'min(12px, 4cqmin)',
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** One status group's students, in the Quiz monitor's row style with each question's mark. */
export const VaRosterList: React.FC<VaRosterListProps> = ({
  bucket,
  students,
  session,
  showTabs,
  onToggleTabs,
  sortBy,
  onSortBy,
  filterBy,
  onFilterBy,
  onUnlock,
  onLetIn,
}) => {
  const now = useServerNow(onLetIn ? 30_000 : null);
  const showToolbar = bucket !== 'notStarted';
  const tabsAllowed = session.sessionOptions?.tabWarningsEnabled !== false;
  const tabsOn = showTabs && tabsAllowed;
  const rows = showToolbar
    ? vaRosterRows(students, sortBy, filterBy)
    : vaRosterRows(students, 'first', 'all');
  const sessionActive = session.status === 'active';

  return (
    <div
      className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {showToolbar && (
        <div
          className="flex flex-wrap items-center"
          style={{ gap: 'min(6px, 1.5cqmin)' }}
        >
          {tabsAllowed && (
            <button
              type="button"
              {...tourAttr('video-activity.monitor-tab-warnings')}
              onClick={onToggleTabs}
              aria-pressed={showTabs}
              className={`rounded-md border font-sans font-medium transition-colors ${
                showTabs
                  ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                  : 'bg-white border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light'
              }`}
              style={fieldStyle}
            >
              Tab warnings
            </button>
          )}
          <select
            value={sortBy}
            onChange={(e) => onSortBy(e.target.value as MonitorSortBy)}
            aria-label="Sort students"
            {...tourTypeAttr('video-activity.monitor-roster-sort', TYPE)}
            className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
            style={fieldStyle}
          >
            <option value="first">First name</option>
            <option value="last">Last name</option>
            <option value="score">Score</option>
          </select>
          <select
            value={filterBy}
            onChange={(e) => onFilterBy(e.target.value as MonitorFilterBy)}
            aria-label="Filter students"
            {...tourTypeAttr('video-activity.monitor-roster-filter', TYPE)}
            className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
            style={fieldStyle}
          >
            <option value="all">Everyone</option>
            <option value="hi">Score 80%+</option>
            <option value="mid">Score 60–79%</option>
            <option value="low">Below 60%</option>
            {tabsAllowed && <option value="tabs">Left activity tab</option>}
          </select>
        </div>
      )}

      {rows.length === 0 && (
        <p
          className="text-brand-gray-primary text-center"
          style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
        >
          {students.length === 0
            ? 'No students here yet.'
            : 'No students match this filter.'}
        </p>
      )}

      {rows.map((s) => {
        const r = s.response;
        const locked = isLocked(s, session);
        const canLetIn =
          !!onLetIn &&
          s.bucket !== 'done' &&
          !studentCanEnter(
            session,
            r.classId ? [r.classId] : [],
            r.studentUid,
            now
          );
        return (
          <div
            key={s.key}
            {...tourFieldAttr('video-activity.monitor-row', TYPE, r.studentUid)}
            className="flex items-center justify-between rounded-lg border border-brand-gray-lightest bg-white"
            style={{
              padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
              gap: 'min(8px, 2cqmin)',
            }}
          >
            <p
              className="font-sans font-medium text-brand-gray-dark truncate min-w-0"
              style={{ fontSize: 'min(13px, 4.5cqmin)' }}
            >
              {s.name}
            </p>
            <div
              className="flex items-center shrink-0"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {tabsOn && (
                <AwayNowChip
                  exits={r.tabExits}
                  completed={s.bucket === 'done'}
                  sessionActive={sessionActive}
                  style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                />
              )}
              {tabsOn && s.tabWarnings > 0 && (
                <TabExitsPopover
                  exits={r.tabExits}
                  warnings={s.tabWarnings}
                  studentName={s.name}
                  completed={s.bucket === 'done'}
                  sessionEnded={!sessionActive}
                >
                  <span
                    className="inline-flex items-center text-brand-red-primary font-sans font-semibold tabular-nums"
                    title={`${s.tabWarnings} tab-switch warning${s.tabWarnings === 1 ? '' : 's'}`}
                    style={{
                      gap: 'min(2px, 0.5cqmin)',
                      fontSize: 'min(11px, 3.8cqmin)',
                    }}
                  >
                    <AlertTriangle aria-hidden style={iconSize} />
                    {s.tabWarnings}
                  </span>
                </TabExitsPopover>
              )}
              {locked && (
                <Lock
                  className="text-brand-gray-primary"
                  aria-label="Locked"
                  style={iconSize}
                />
              )}
              {r.unlocked && s.bucket !== 'done' && (
                <Unlock
                  className="text-emerald-600"
                  aria-label="Resumed after unlock"
                  style={iconSize}
                />
              )}
              {s.bucket !== 'notStarted' && s.marks.length > 0 && (
                <span
                  className="flex items-center"
                  role="img"
                  aria-label={`${s.marks.filter((m) => m === 'correct').length} of ${s.marks.length} correct`}
                  style={{ gap: 'min(3px, 0.8cqmin)' }}
                >
                  {s.marks.map((m, i) =>
                    m === 'correct' ? (
                      <CheckCircle2
                        key={i}
                        aria-hidden
                        className="text-emerald-600"
                        style={markSize}
                      />
                    ) : m === 'wrong' ? (
                      <XCircle
                        key={i}
                        aria-hidden
                        className="text-brand-red-primary"
                        style={markSize}
                      />
                    ) : (
                      <Circle
                        key={i}
                        aria-hidden
                        className="text-brand-gray-lighter"
                        style={markSize}
                      />
                    )
                  )}
                </span>
              )}
              {s.bucket === 'done' &&
                (s.score != null ? (
                  <span
                    className="rounded-full font-sans font-semibold tabular-nums bg-brand-blue-lighter text-brand-blue-dark"
                    style={{
                      fontSize: 'min(11px, 3.8cqmin)',
                      padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                    }}
                  >
                    {s.score}%
                  </span>
                ) : (
                  <span
                    className="text-brand-gray-light"
                    style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                  >
                    —
                  </span>
                ))}
              <RowMenu
                student={s}
                locked={locked}
                canLetIn={canLetIn}
                onUnlock={onUnlock}
                onLetIn={onLetIn}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
