import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { LayoutGrid, RefreshCw, RotateCcw, Shuffle, Users } from 'lucide-react';
import { StationsConfig, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { ActiveClassChip } from '@/components/common/ActiveClassChip';
import { Button } from '@/components/common/Button';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { DraggableStudent } from '@/components/widgets/LunchCount/components/DraggableStudent';
import { DroppableZone } from '@/components/widgets/LunchCount/components/DroppableZone';
import { beginWidgetDrag, endWidgetDrag } from '@/utils/widgetDragFlag';
import { getFontClass, hexToRgba } from '@/utils/styles';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { StationCard } from './components/StationCard';
import { studentChipClass, studentChipStyle } from './components/studentChip';
import {
  rotateAssignments,
  shuffleStudentsIntoStations,
  resetAllAssignments,
  resetStation,
  stationCount,
} from './hooks/stationsActions';

const UNASSIGNED_DROP_ID = 'stations:unassigned';
const STATION_DROP_PREFIX = 'station:';

export const StationsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, rosters, activeRosterId, activeDashboard } =
    useDashboard();
  const config = widget.config as StationsConfig;
  const stations = useMemo(() => config.stations ?? [], [config.stations]);
  const assignments = useMemo(
    () => config.assignments ?? {},
    [config.assignments]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const orderedStations = useMemo(
    () => [...stations].sort((a, b) => a.order - b.order),
    [stations]
  );

  const activeRoster = useMemo((): string[] => {
    if (config.rosterMode === 'custom') return config.customRoster ?? [];
    const currentRoster =
      rosters.find((r) => r.id === activeRosterId) ?? rosters[0];
    return (
      currentRoster?.students.map((s) =>
        `${s.firstName} ${s.lastName}`.trim()
      ) ?? []
    );
  }, [config.rosterMode, config.customRoster, rosters, activeRosterId]);

  // Group students by station id (for chip lists) plus an unassigned bucket.
  // Stale assignments (students no longer in roster) survive silently — we
  // only render chips for roster members so missing-from-roster keys don't
  // appear, but they remain in `assignments` until the next reset.
  const grouped = useMemo(() => {
    const byStation: Record<string, string[]> = {};
    for (const station of orderedStations) byStation[station.id] = [];
    const unassigned: string[] = [];
    for (const name of activeRoster) {
      const value = assignments[name];
      if (value && byStation[value]) {
        byStation[value].push(name);
      } else {
        unassigned.push(name);
      }
    }
    return { byStation, unassigned };
  }, [orderedStations, activeRoster, assignments]);

  const persistAssignments = useCallback(
    (next: Record<string, string | null>) => {
      updateWidget(widget.id, {
        config: { ...config, assignments: next },
      });
    },
    [widget.id, config, updateWidget]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    beginWidgetDrag();
    setActiveId(event.active.id as string);
  }, []);

  const handleDragCancel = useCallback(() => {
    endWidgetDrag();
    setActiveId(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      endWidgetDrag();
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;
      const studentName = String(active.id);
      const overId = String(over.id);

      if (overId === UNASSIGNED_DROP_ID) {
        const next = { ...assignments, [studentName]: null };
        persistAssignments(next);
        return;
      }
      if (overId.startsWith(STATION_DROP_PREFIX)) {
        const stationId = overId.slice(STATION_DROP_PREFIX.length);
        const station = orderedStations.find((s) => s.id === stationId);
        if (!station) return;
        // Capacity guard: refuse and toast if full (and the student isn't
        // already there — moving within the same station is a no-op).
        if (assignments[studentName] === stationId) return;
        if (
          station.maxStudents != null &&
          stationCount(assignments, stationId) >= station.maxStudents
        ) {
          addToast(`${station.title || 'Station'} is full.`, 'info');
          return;
        }
        const next = { ...assignments, [studentName]: stationId };
        persistAssignments(next);
      }
    },
    [assignments, orderedStations, persistAssignments, addToast]
  );

  const handleResetAll = useCallback(() => {
    persistAssignments(resetAllAssignments(activeRoster));
  }, [persistAssignments, activeRoster]);

  const handleResetStation = useCallback(
    (stationId: string) => {
      persistAssignments(resetStation(assignments, stationId));
    },
    [persistAssignments, assignments]
  );

  const handleRotate = useCallback(() => {
    if (orderedStations.length < 2) {
      addToast('Add at least two stations to rotate.', 'info');
      return;
    }
    const result = rotateAssignments(orderedStations, assignments);
    persistAssignments(result.assignments);
    if (result.stuckStudents.length > 0) {
      addToast(
        `${result.stuckStudents.length} student${result.stuckStudents.length === 1 ? '' : 's'} could not rotate (stations full).`,
        'info'
      );
    }
  }, [orderedStations, assignments, persistAssignments, addToast]);

  const handleShuffle = useCallback(() => {
    if (orderedStations.length === 0) {
      addToast('Add at least one station first.', 'info');
      return;
    }
    if (activeRoster.length === 0) {
      addToast('No students in the active class.', 'info');
      return;
    }
    const result = shuffleStudentsIntoStations(orderedStations, activeRoster);
    persistAssignments(result.assignments);
    if (result.overflowStudents.length > 0) {
      addToast(
        `${result.overflowStudents.length} student${result.overflowStudents.length === 1 ? '' : 's'} unassigned (over capacity).`,
        'info'
      );
    }
  }, [orderedStations, activeRoster, persistAssignments, addToast]);

  // Watch rotationTrigger from a linked Timer — bumps to Date.now() invoke rotate.
  // Mirrors `externalTrigger` in RandomWidget.tsx: assign the latest callback
  // to a ref during render so the effect's body always sees the freshest
  // closure without listing the callback as a dep (which would re-run the
  // effect every render and risk firing the rotation more than once for the
  // same trigger value).
  const lastTriggerRef = useRef(config.rotationTrigger ?? 0);
  const handleRotateRef = useRef(handleRotate);
  // eslint-disable-next-line react-hooks/refs
  handleRotateRef.current = handleRotate;
  useEffect(() => {
    const trigger = config.rotationTrigger ?? 0;
    if (trigger > lastTriggerRef.current) {
      lastTriggerRef.current = trigger;
      handleRotateRef.current();
    }
  }, [config.rotationTrigger]);

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0.5' } },
    }),
  };

  // Empty state when the teacher hasn't configured any stations yet.
  if (orderedStations.length === 0) {
    return (
      <ScaledEmptyState
        icon={LayoutGrid}
        title="No stations yet"
        subtitle="Flip to add your first station."
      />
    );
  }

  const cardColor = config.cardColor ?? '#f8fafc';
  const cardOpacity = config.cardOpacity ?? 0.4;

  // Resolve typography from widget config + active dashboard global style. The
  // shared TypographySettings primitive writes values like 'global', 'font-sans',
  // etc.; getFontClass() returns a Tailwind class string ready to apply.
  const fontClassName = getFontClass(
    config.fontFamily ?? 'global',
    activeDashboard?.globalStyle?.fontFamily ?? 'sans'
  );
  const fontColor = config.fontColor;

  // Adapt grid columns to station count — keeps cards roomy when there are few
  // stations and stays tidy when there are many.
  const cols = Math.min(
    4,
    Math.max(1, Math.ceil(Math.sqrt(orderedStations.length)))
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <WidgetLayout
        padding="p-0"
        header={
          <div
            className={`flex justify-between items-center border-b border-slate-100 ${fontClassName}`}
            style={{
              backgroundColor: hexToRgba(cardColor, cardOpacity),
              padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)',
              gap: 'min(10px, 2cqmin)',
            }}
          >
            <div
              className="flex items-center min-w-0"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              <h3
                className="font-black uppercase tracking-widest truncate"
                style={{
                  fontSize: 'min(13px, 4.2cqmin)',
                  color: fontColor ?? '#334155',
                }}
              >
                Stations
              </h3>
              {config.rosterMode !== 'custom' && rosters.length > 0 && (
                <ActiveClassChip />
              )}
            </div>

            <div
              className="flex items-center shrink-0"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <Button
                onClick={handleShuffle}
                variant="ghost"
                size="sm"
                className="rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-brand-blue-primary"
                style={{
                  padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                  height: 'min(32px, 8cqmin)',
                  fontSize: 'min(11px, 3.5cqmin)',
                }}
                title="Shuffle students into stations"
              >
                <Shuffle
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
                <span
                  className="ml-1 font-black uppercase tracking-widest"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  Shuffle
                </span>
              </Button>
              <Button
                onClick={handleRotate}
                variant="ghost"
                size="sm"
                className="rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-brand-blue-primary"
                style={{
                  padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                  height: 'min(32px, 8cqmin)',
                  fontSize: 'min(11px, 3.5cqmin)',
                }}
                title="Rotate clockwise"
              >
                <RefreshCw
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
                <span
                  className="ml-1 font-black uppercase tracking-widest"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  Rotate
                </span>
              </Button>
              <Button
                onClick={handleResetAll}
                variant="ghost"
                size="sm"
                className="rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-brand-red-primary"
                style={{
                  padding: 'min(6px, 1.5cqmin)',
                  width: 'min(32px, 8cqmin)',
                  height: 'min(32px, 8cqmin)',
                }}
                title="Reset all"
                aria-label="Reset all"
              >
                <RotateCcw
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
              </Button>
            </div>
          </div>
        }
        content={
          <div
            className={`flex flex-col h-full w-full overflow-hidden ${fontClassName}`}
            style={{
              padding: 'min(10px, 2cqmin)',
              gap: 'min(10px, 2cqmin)',
            }}
          >
            <div
              className="grid flex-1"
              style={{
                gap: 'min(10px, 2cqmin)',
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                minHeight: 0,
              }}
            >
              {orderedStations.map((station) => {
                const members = grouped.byStation[station.id] ?? [];
                const isFull =
                  station.maxStudents != null &&
                  members.length >= station.maxStudents;
                return (
                  <StationCard
                    key={station.id}
                    station={station}
                    members={members}
                    onUnassign={(student) => {
                      const next = { ...assignments, [student]: null };
                      persistAssignments(next);
                    }}
                    onResetStation={() => handleResetStation(station.id)}
                    isFull={isFull}
                    fontClassName={fontClassName}
                    bodyTextColor={fontColor}
                  />
                );
              })}
            </div>

            <div className="flex flex-col" style={{ maxHeight: '40cqh' }}>
              <DroppableZone
                id={UNASSIGNED_DROP_ID}
                className={`${grouped.unassigned.length > 0 ? 'flex-1' : 'flex-none'} border-2 border-dashed border-slate-200 rounded-3xl overflow-y-auto custom-scrollbar shadow-inner`}
                style={{
                  backgroundColor: hexToRgba(cardColor, cardOpacity),
                  padding: 'min(10px, 2cqmin)',
                  minHeight: 'min(56px, 10cqmin)',
                }}
                activeClassName="bg-slate-100 border-brand-blue-primary ring-4 ring-brand-blue-lighter/20"
              >
                <div
                  className={`flex flex-col items-center ${grouped.unassigned.length > 0 ? 'h-full' : ''}`}
                >
                  <div
                    className="flex items-center"
                    style={{
                      gap: 'min(6px, 1.5cqmin)',
                      marginBottom:
                        grouped.unassigned.length > 0
                          ? 'min(8px, 2cqmin)'
                          : '0',
                    }}
                  >
                    <Users
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                      className="text-slate-300"
                    />
                    <span
                      className="font-black uppercase text-slate-400 tracking-widest"
                      style={{ fontSize: 'min(11px, 4cqmin)' }}
                    >
                      Unassigned ({grouped.unassigned.length})
                    </span>
                  </div>

                  <div
                    className="flex flex-wrap justify-center w-full"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    {grouped.unassigned.map((student) => (
                      <DraggableStudent
                        key={student}
                        id={student}
                        name={student}
                        className={studentChipClass}
                        style={{
                          ...studentChipStyle,
                          ...(fontColor ? { color: fontColor } : {}),
                        }}
                      />
                    ))}
                  </div>
                </div>
              </DroppableZone>
            </div>
          </div>
        }
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
