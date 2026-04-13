import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  defaultDropAnimationSideEffects,
  MouseSensor,
  TouchSensor,
  pointerWithin,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  WidgetData,
  LunchCountConfig,
  LunchCountGlobalConfig,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';
import { Button } from '@/components/common/Button';
import { RefreshCw, Undo2, CheckCircle2, Box, Users } from 'lucide-react';
import { SubmitReportModal } from './SubmitReportModal';
import { useNutrislice } from './useNutrislice';
import { DraggableStudent } from './components/DraggableStudent';
import { DroppableZone } from './components/DroppableZone';

import { WidgetLayout } from '../WidgetLayout';

/**
 * Format a grade value into the spreadsheet label used in column B.
 *   Schumann: K → K, 1 → GR1, 2 → GR2, MAC → MAC
 *   Intermediate: 3 → GR3, 4 → GR4, 5 → GR5
 */
function formatGradeLabel(grade: string): string {
  if (!grade) return '';
  if (grade === 'K' || grade === 'MAC') return grade;
  return `GR${grade}`;
}

/**
 * Format a display name to "F. Last" (first initial + last name).
 * e.g. "Jane Smith" → "J. Smith". Returns the cleaned name as-is for single-word names.
 */
function formatTeacherName(displayName: string): string {
  if (!displayName) return 'Staff';
  const name = displayName.trim();
  if (!name) return 'Staff';

  // Handle "Last, First" (e.g. "Smith, Jane")
  if (name.includes(',')) {
    const parts = name.split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      const last = parts[0];
      const first = parts[1];
      if (first.length > 0) {
        return `${first[0].toUpperCase()}. ${last}`;
      }
    }
  }

  // Handle "First Last" or "First Middle Last"
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first.length > 0) {
      return `${first[0].toUpperCase()}. ${last}`;
    }
  }

  return name;
}

/**
 * Format hour/minute strings into "H:MM" for display and submission.
 * Returns an empty string if hour is not set or falls outside 1-12.
 * Invalid minute values are silently clamped to 0.
 */
function formatLunchTime(hour: string, minute: string): string {
  if (!hour) return '';
  const parsedHour = Number(hour);
  if (!Number.isFinite(parsedHour) || parsedHour < 1 || parsedHour > 12) {
    return '';
  }
  const parsedMinute = Number(minute || '0');
  const safeMinute =
    Number.isFinite(parsedMinute) && parsedMinute >= 0 && parsedMinute < 60
      ? parsedMinute
      : 0;
  return `${String(parsedHour)}:${String(safeMinute).padStart(2, '0')}`;
}

/**
 * Build a Central Time (America/Chicago) timestamp string.
 * Falls back to the user's local time if the Intl API isn't available.
 */
function getCentralTimestamp(): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch (error) {
    console.warn(
      '[LunchCountWidget] Failed to format timestamp in America/Chicago timezone; falling back to local time. Timestamps may not be in Central Time.',
      error
    );
    return new Date().toLocaleString();
  }
}

export const LunchCountWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t, i18n } = useTranslation();
  const { updateWidget, addToast, rosters, activeRosterId, activeDashboard } =
    useDashboard();
  const { user, featurePermissions } = useAuth();
  const config = widget.config as LunchCountConfig;
  const {
    cachedMenu = null,
    assignments = {},
    roster = [],
    rosterMode = 'class',
    schoolSite = 'schumann-elementary',
    lunchTimeHour = '',
    lunchTimeMinute = '',
    gradeLevel = '',
  } = config;

  // Resolve global lunch count settings from feature permissions
  const lunchGlobalConfig = useMemo((): LunchCountGlobalConfig => {
    const perm = featurePermissions.find((p) => p.widgetType === 'lunchCount');
    return (perm?.config ?? {}) as LunchCountGlobalConfig;
  }, [featurePermissions]);

  const { isSyncing, fetchNutrislice } = useNutrislice({
    widgetId: widget.id,
    config,
    updateWidget,
    addToast,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const activeRoster = useMemo((): string[] => {
    if (rosterMode === 'custom') return roster;
    const currentRoster =
      rosters.find((r) => r.id === activeRosterId) ?? rosters[0];
    return (
      currentRoster?.students.map((s) =>
        `${s.firstName} ${s.lastName}`.trim()
      ) ?? []
    );
  }, [rosterMode, roster, rosters, activeRosterId]);

  const groupedStudents = useMemo(() => {
    const hot: string[] = [];
    const bento: string[] = [];
    const home: string[] = [];
    const unassigned: string[] = [];

    activeRoster.forEach((student) => {
      const assignment = assignments[student];
      if (assignment === 'hot') hot.push(student);
      else if (assignment === 'bento') bento.push(student);
      else if (assignment === 'home') home.push(student);
      else unassigned.push(student);
    });

    return { hot, bento, home, unassigned };
  }, [activeRoster, assignments]);

  const stats = useMemo(() => {
    const hotLunch = groupedStudents.hot.length;
    const bentoBox = groupedStudents.bento.length;
    const homeLunch = groupedStudents.home.length;
    const remaining = groupedStudents.unassigned.length;
    const total = hotLunch + bentoBox + homeLunch + remaining;

    return { total, hotLunch, bentoBox, homeLunch, remaining };
  }, [groupedStudents]);

  const updateAssignment = useCallback(
    (student: string, type: 'hot' | 'bento' | 'home' | null) => {
      const newAssignments = { ...assignments };
      if (type === null) {
        delete newAssignments[student];
      } else {
        newAssignments[student] = type;
      }
      updateWidget(widget.id, {
        config: { ...config, assignments: newAssignments },
      });
    },
    [widget.id, config, assignments, updateWidget]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      const student = active.id as string;

      if (over?.id === 'hot' || over?.id === 'bento' || over?.id === 'home') {
        updateAssignment(student, over.id);
      } else if (assignments[student]) {
        // Dropped in 'unassigned' zone or outside all zones — only write if currently assigned
        updateAssignment(student, null);
      }
    },
    [assignments, updateAssignment]
  );

  const handleSubmitReport = async (notes: string, extraPizza?: number) => {
    const { submissionUrl, schumannSheetId, intermediateSheetId } =
      lunchGlobalConfig;

    if (!submissionUrl) {
      addToast(
        'No submission URL configured. Contact your administrator.',
        'error'
      );
      return;
    }

    const sheetId =
      schoolSite === 'orono-intermediate-school'
        ? intermediateSheetId
        : schumannSheetId;

    if (!sheetId) {
      addToast(
        'No Google Sheet ID configured for this school site. Contact your administrator.',
        'error'
      );
      return;
    }

    const teacherName = formatTeacherName(user?.displayName ?? 'Staff');
    const gradeLabel = formatGradeLabel(gradeLevel);
    const lunchTime = formatLunchTime(lunchTimeHour, lunchTimeMinute);

    const timestamp = getCentralTimestamp();
    // Column B: [Lunch Time] - [Grade] - [Teacher]
    // We use placeholders if some data is missing to ensure the format is consistent
    const label = `${lunchTime || '??:??'} - ${gradeLabel || 'Grade ?'} - ${teacherName}`;

    // Columns C-F mapped for each school:
    //   Schumann:     C=hotLunch, D=bentoBox, E=(blank), F=notes
    //   Intermediate: C=hotLunch, D=bentoBox, E=extraPizza, F=notes
    const isIntermediate = schoolSite === 'orono-intermediate-school';

    setIsSubmitting(true);
    try {
      const payload = {
        timestamp,
        label,
        hotLunch: stats.hotLunch,
        bentoBox: stats.bentoBox,
        extraPizza: isIntermediate ? (extraPizza ?? 0) : 0,
        notes,
        spreadsheetId: sheetId,
      };

      const response = await fetch(submissionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Submission failed with status ${response.status}`);
      }

      const result = await response.text();
      if (result.startsWith('Error')) {
        throw new Error(result);
      }

      addToast('Lunch report submitted successfully!', 'success');
      setIsModalOpen(false);
    } catch (err) {
      console.error('[LunchCountWidget] Submission error:', err);
      addToast(
        err instanceof Error
          ? err.message
          : 'Failed to submit report. Check your connection and try again.',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  const studentItemClass =
    'bg-white border-b-2 border-slate-200 rounded-xl font-black text-slate-700 shadow-sm hover:border-brand-blue-primary hover:-translate-y-0.5 transition-all active:scale-90';

  const studentItemStyle: React.CSSProperties = {
    fontSize: 'min(16px, 6cqmin)',
    padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
  };

  if (
    schoolSite === 'orono-middle-school' ||
    schoolSite === 'orono-high-school'
  ) {
    const hotLunchItem = config.isManualMode
      ? config.manualHotLunch || t('widgets.lunchCount.noHotLunch')
      : (cachedMenu?.hotLunch ?? t('common.loading'));

    const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
    const fontClass =
      globalStyle.fontFamily === 'sans'
        ? 'font-sans'
        : `font-${globalStyle.fontFamily}`;

    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="flex flex-col items-center justify-center h-full w-full relative group transition-colors duration-500 overflow-hidden">
            {/* Subtle background — respects cardColor/cardOpacity settings */}
            <div className="absolute inset-0 -z-10" style={{}} />

            {/* Subtle Refresh Button - only visible on hover */}
            <Button
              onClick={() => void fetchNutrislice()}
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 rounded-xl bg-white/40 hover:bg-white border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                width: 'min(32px, 8cqmin)',
                height: 'min(32px, 8cqmin)',
                padding: 0,
              }}
              disabled={isSyncing}
              aria-label="Refresh menu"
            >
              <RefreshCw
                style={{
                  width: 'min(16px, 4.5cqmin)',
                  height: 'min(16px, 4.5cqmin)',
                }}
                className={isSyncing ? 'animate-spin' : ''}
              />
            </Button>

            <div
              className={`flex flex-col items-center justify-center w-full h-full gap-[0.5cqh] px-[4cqw] ${fontClass}`}
            >
              <span
                className="font-black uppercase text-brand-red-primary tracking-[0.2em] opacity-60"
                style={{ fontSize: 'min(14cqh, 4cqw)' }}
              >
                {t('widgets.lunchCount.hotLunch')}
              </span>

              <div
                className="font-black text-slate-900 leading-[1.1] tracking-tighter text-center line-clamp-3"
                style={{
                  fontSize:
                    hotLunchItem.length > 20
                      ? 'min(45cqh, 10cqw)'
                      : 'min(55cqh, 12cqw)',
                  color: '#2d3f89', // Brand Blue Primary
                }}
              >
                {hotLunchItem}
              </div>

              <div
                className="opacity-40 uppercase tracking-[0.2em] text-slate-900 font-black mt-[1.5cqh]"
                style={{ fontSize: 'min(10cqh, 3.5cqw)' }}
              >
                {new Date().toLocaleDateString(i18n.language, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
          </div>
        }
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <WidgetLayout
        padding="p-0"
        header={
          <div
            className="flex justify-between items-center border-b border-slate-100"
            style={{
              padding: 'min(10px, 2cqmin)',
              gap: 'min(12px, 2.5cqmin)',
            }}
          >
            <div className="flex flex-col shrink-0">
              <h3
                style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                className="font-black text-slate-700 uppercase tracking-widest"
              >
                Daily Lunch Count
              </h3>
              <p
                style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                className="font-bold text-slate-500 uppercase tracking-tighter"
              >
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>

            <Button
              onClick={() => setIsModalOpen(true)}
              disabled={stats.remaining > 0 || stats.total === 0}
              variant={
                stats.remaining === 0 && stats.total > 0
                  ? 'primary'
                  : 'secondary'
              }
              className="flex-1 rounded-xl font-black uppercase tracking-widest transition-all shadow-sm"
              style={{
                padding: 'min(6px, 1.5cqmin) min(16px, 4cqmin)',
                fontSize: 'min(12px, 4cqmin)',
                height: 'min(36px, 9cqmin)',
                maxWidth: 'min(280px, 50%)',
              }}
            >
              {stats.remaining === 0 && stats.total > 0 ? (
                <div
                  className="flex items-center justify-center"
                  style={{ gap: 'min(8px, 2cqmin)' }}
                >
                  <CheckCircle2
                    style={{
                      width: 'min(18px, 4.5cqmin)',
                      height: 'min(18px, 4.5cqmin)',
                    }}
                  />
                  Submit Report
                </div>
              ) : (
                <div
                  className="flex items-center justify-center opacity-60"
                  style={{ gap: 'min(8px, 2cqmin)' }}
                >
                  <Users
                    style={{
                      width: 'min(18px, 4.5cqmin)',
                      height: 'min(18px, 4.5cqmin)',
                    }}
                  />
                  Assign {stats.remaining} More Students
                </div>
              )}
            </Button>

            <div
              className="flex shrink-0"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <Button
                onClick={() => void fetchNutrislice()}
                variant="ghost"
                size="sm"
                className="rounded-xl bg-white border border-slate-200"
                style={{
                  padding: 'min(6px, 1.5cqmin)',
                  width: 'min(32px, 8cqmin)',
                  height: 'min(32px, 8cqmin)',
                }}
                disabled={isSyncing}
              >
                <RefreshCw
                  style={{
                    width: 'min(16px, 4.5cqmin)',
                    height: 'min(16px, 4.5cqmin)',
                  }}
                  className={isSyncing ? 'animate-spin' : ''}
                />
              </Button>
              <Button
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, assignments: {} },
                  })
                }
                variant="ghost"
                size="sm"
                className="rounded-xl text-slate-400 hover:text-brand-red-primary bg-white border border-slate-200"
                style={{
                  padding: 'min(6px, 1.5cqmin)',
                  width: 'min(32px, 8cqmin)',
                  height: 'min(32px, 8cqmin)',
                }}
              >
                <Undo2
                  style={{
                    width: 'min(16px, 4.5cqmin)',
                    height: 'min(16px, 4.5cqmin)',
                  }}
                />
              </Button>
            </div>
          </div>
        }
        content={
          <div
            className="flex flex-col h-full w-full overflow-hidden animate-in fade-in duration-300"
            style={{ padding: 'min(10px, 2cqmin)', gap: 'min(10px, 2cqmin)' }}
          >
            {/* Top Grid: 3 Zones */}
            <div
              className="grid grid-cols-3 flex-1"
              style={{ gap: 'min(10px, 2cqmin)', minHeight: 0 }}
            >
              {/* Hot Lunch Drop Zone */}
              <DroppableZone
                id="hot"
                data-testid="hot-zone"
                className="bg-brand-red-lighter/10 border-2 border-dashed border-brand-red-lighter rounded-2xl flex flex-col transition-all group"
                style={{ padding: 'min(10px, 2cqmin)' }}
                activeClassName="border-solid border-brand-red-primary bg-brand-red-lighter/30 scale-[1.02]"
              >
                <div
                  className="flex justify-between items-start"
                  style={{ marginBottom: 'min(6px, 1.5cqmin)' }}
                >
                  <div className="flex flex-col">
                    <span
                      style={{ fontSize: 'min(11px, 4cqmin)' }}
                      className="font-black uppercase text-brand-red-primary tracking-tighter"
                    >
                      Hot Lunch
                    </span>
                    <span
                      style={{
                        fontSize: 'min(14px, 5cqmin)',
                        padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
                      }}
                      className="bg-brand-red-primary text-white rounded-full font-black w-max"
                    >
                      {stats.hotLunch}
                    </span>
                  </div>
                  <Box
                    style={{
                      width: 'min(14px, 4cqmin)',
                      height: 'min(14px, 4cqmin)',
                    }}
                    className="text-brand-red-primary opacity-40 group-hover:scale-110 transition-transform"
                  />
                </div>
                <div
                  style={{
                    fontSize: 'min(11px, 4cqmin)',
                    marginBottom: 'min(10px, 2cqmin)',
                  }}
                  className="font-bold text-brand-red-dark leading-tight line-clamp-2 italic opacity-60"
                >
                  {cachedMenu?.hotLunch ?? 'Loading menu...'}
                </div>
                <div
                  className="flex-1 flex flex-wrap content-start overflow-y-auto custom-scrollbar"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    paddingRight: 'min(4px, 1cqmin)',
                  }}
                >
                  {groupedStudents.hot.map((student) => (
                    <DraggableStudent
                      key={student}
                      id={student}
                      name={student}
                      onClick={() => updateAssignment(student, null)}
                      className={studentItemClass}
                      style={studentItemStyle}
                    />
                  ))}
                </div>
              </DroppableZone>

              {/* Bento Box Drop Zone */}
              <DroppableZone
                id="bento"
                className="bg-emerald-50 border-2 border-dashed border-emerald-300 rounded-2xl flex flex-col transition-all group"
                style={{ padding: 'min(10px, 2cqmin)' }}
                activeClassName="border-solid border-emerald-500 bg-emerald-100/50 scale-[1.02]"
              >
                <div
                  className="flex justify-between items-start"
                  style={{ marginBottom: 'min(6px, 1.5cqmin)' }}
                >
                  <div className="flex flex-col">
                    <span
                      style={{ fontSize: 'min(11px, 4cqmin)' }}
                      className="font-black uppercase text-emerald-600 tracking-tighter"
                    >
                      Bento Box
                    </span>
                    <span
                      style={{
                        fontSize: 'min(14px, 5cqmin)',
                        padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
                      }}
                      className="bg-emerald-500 text-white rounded-full font-black w-max"
                    >
                      {stats.bentoBox}
                    </span>
                  </div>
                  <Box
                    style={{
                      width: 'min(14px, 4cqmin)',
                      height: 'min(14px, 4cqmin)',
                    }}
                    className="text-emerald-400 group-hover:scale-110 transition-transform"
                  />
                </div>
                <div
                  style={{
                    fontSize: 'min(11px, 4cqmin)',
                    marginBottom: 'min(10px, 2cqmin)',
                  }}
                  className="font-bold text-emerald-800 leading-tight line-clamp-2 italic opacity-60"
                >
                  {cachedMenu?.bentoBox ?? 'Loading menu...'}
                </div>
                <div
                  className="flex-1 flex flex-wrap content-start overflow-y-auto custom-scrollbar"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    paddingRight: 'min(4px, 1cqmin)',
                  }}
                >
                  {groupedStudents.bento.map((student) => (
                    <DraggableStudent
                      key={student}
                      id={student}
                      name={student}
                      onClick={() => updateAssignment(student, null)}
                      className={studentItemClass}
                      style={studentItemStyle}
                    />
                  ))}
                </div>
              </DroppableZone>

              {/* Home Lunch Drop Zone */}
              <DroppableZone
                id="home"
                className="bg-brand-blue-lighter/20 border-2 border-dashed border-brand-blue-lighter rounded-2xl flex flex-col transition-all group"
                style={{ padding: 'min(10px, 2cqmin)' }}
                activeClassName="border-solid border-brand-blue-primary bg-brand-blue-lighter/40 scale-[1.02]"
              >
                <div
                  className="flex justify-between items-start"
                  style={{ marginBottom: 'min(6px, 1.5cqmin)' }}
                >
                  <div className="flex flex-col">
                    <span
                      style={{ fontSize: 'min(11px, 4cqmin)' }}
                      className="font-black uppercase text-brand-blue-primary tracking-tighter"
                    >
                      Home / Other
                    </span>
                    <span
                      style={{
                        fontSize: 'min(14px, 5cqmin)',
                        padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
                      }}
                      className="bg-brand-blue-primary text-white rounded-full font-black w-max"
                    >
                      {stats.homeLunch}
                    </span>
                  </div>
                  <Box
                    style={{
                      width: 'min(14px, 4cqmin)',
                      height: 'min(14px, 4cqmin)',
                    }}
                    className="text-brand-blue-primary opacity-40 group-hover:scale-110 transition-transform"
                  />
                </div>
                <div
                  style={{
                    fontSize: 'min(11px, 4cqmin)',
                    marginBottom: 'min(10px, 2cqmin)',
                  }}
                  className="font-bold text-brand-blue-dark leading-tight italic opacity-60"
                >
                  Field Trips / Absent
                </div>
                <div
                  className="flex-1 flex flex-wrap content-start overflow-y-auto custom-scrollbar"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    paddingRight: 'min(4px, 1cqmin)',
                  }}
                >
                  {groupedStudents.home.map((student) => (
                    <DraggableStudent
                      key={student}
                      id={student}
                      name={student}
                      onClick={() => updateAssignment(student, null)}
                      className={studentItemClass}
                      style={studentItemStyle}
                    />
                  ))}
                </div>
              </DroppableZone>
            </div>

            {/* Bottom Area: All Unassigned Students */}
            <div
              className="flex flex-col transition-all duration-300"
              style={{ maxHeight: '45cqh' }}
            >
              <DroppableZone
                id="unassigned"
                className={`${stats.remaining > 0 ? 'flex-1' : 'flex-none'} border-2 border-dashed border-slate-200 rounded-3xl overflow-y-auto custom-scrollbar shadow-inner`}
                style={{
                  padding: 'min(12px, 2.5cqmin)',
                  minHeight: 'min(56px, 10cqmin)',
                }}
                activeClassName="bg-slate-100 border-brand-blue-primary ring-4 ring-brand-blue-lighter/20"
              >
                <div
                  className={`flex flex-col items-center ${stats.remaining > 0 ? 'h-full' : ''}`}
                >
                  <div
                    className="flex items-center"
                    style={{
                      gap: 'min(6px, 1.5cqmin)',
                      marginBottom:
                        stats.remaining > 0 ? 'min(12px, 2.5cqmin)' : '0',
                    }}
                  >
                    <Users
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                      className="text-slate-300"
                    />
                    <span
                      style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                      className="font-black uppercase text-slate-400 tracking-widest"
                    >
                      Unassigned ({stats.remaining})
                    </span>
                  </div>

                  <div
                    className="flex flex-wrap justify-center w-full"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    {groupedStudents.unassigned.map((student) => (
                      <DraggableStudent
                        key={student}
                        id={student}
                        name={student}
                        className={studentItemClass}
                        style={studentItemStyle}
                      />
                    ))}
                  </div>
                </div>
              </DroppableZone>
            </div>
          </div>
        }
      />

      {/* Modal */}
      <SubmitReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitReport}
        data={{
          date: new Date().toLocaleDateString(),
          staffName: formatTeacherName(user?.displayName ?? 'Unknown Staff'),
          hotLunch: stats.hotLunch,
          bentoBox: stats.bentoBox,
          hotLunchName: cachedMenu?.hotLunch ?? 'Hot Lunch',
          bentoBoxName: cachedMenu?.bentoBox ?? 'Bento Box',
          schoolSite,
          lunchTime: formatLunchTime(lunchTimeHour, lunchTimeMinute),
          gradeLabel: formatGradeLabel(gradeLevel),
          submissionLabel: [
            formatLunchTime(lunchTimeHour, lunchTimeMinute),
            formatGradeLabel(gradeLevel),
            formatTeacherName(user?.displayName ?? 'Unknown Staff'),
          ]
            .filter(Boolean)
            .join(' - '),
        }}
        isSubmitting={isSubmitting}
      />
      <DragOverlay
        dropAnimation={dropAnimation}
        modifiers={[snapCenterToCursor]}
      >
        {activeId ? (
          <div
            data-no-drag="true"
            className="bg-brand-blue-primary border-b-4 border-brand-blue-dark rounded-2xl font-black text-white shadow-2xl scale-110 opacity-95 cursor-grabbing pointer-events-none"
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
              fontSize: 'min(14px, 6cqmin)',
            }}
          >
            {activeId}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
