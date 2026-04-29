import React from 'react';
import { Station } from '@/types';
import { DroppableZone } from '@/components/widgets/LunchCount/components/DroppableZone';
import { DraggableStudent } from '@/components/widgets/LunchCount/components/DraggableStudent';
import { renderCatalystIcon } from '@/components/widgets/Catalyst/catalystHelpers';
import { LayoutGrid, RotateCcw } from 'lucide-react';
import { hexToRgba } from '@/utils/styles';

interface StationCardProps {
  station: Station;
  members: string[];
  onUnassign: (student: string) => void;
  onResetStation: () => void;
  isFull: boolean;
}

const studentChipClass =
  'bg-white border-b-2 border-slate-200 rounded-xl font-black text-slate-700 shadow-sm hover:border-brand-blue-primary hover:-translate-y-0.5 transition-all active:scale-90';

const studentChipStyle: React.CSSProperties = {
  fontSize: 'min(14px, 5cqmin)',
  padding: 'min(6px, 1.6cqmin) min(12px, 3cqmin)',
};

export const StationCard: React.FC<StationCardProps> = ({
  station,
  members,
  onUnassign,
  onResetStation,
  isFull,
}) => {
  const accent = station.color?.trim() ? station.color : '#10b981';
  const tint = hexToRgba(accent, 0.08);
  const tintHover = hexToRgba(accent, 0.16);
  const capLabel =
    station.maxStudents != null
      ? `${members.length} / ${station.maxStudents}`
      : `${members.length}`;
  const iconSource = station.imageUrl?.trim()
    ? station.imageUrl
    : station.iconName?.trim()
      ? station.iconName
      : 'LayoutGrid';

  return (
    <DroppableZone
      id={`station:${station.id}`}
      className="relative rounded-2xl border-2 border-dashed flex flex-col transition-all group h-full overflow-hidden"
      style={{
        borderColor: accent,
        backgroundColor: tint,
        padding: 'min(10px, 2cqmin)',
      }}
      activeClassName={isFull ? '' : 'border-solid scale-[1.02]'}
    >
      {/* Subtle hover background that respects the accent color */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ backgroundColor: tintHover }}
      />

      {/* Per-station reset button — small but reachable */}
      <button
        type="button"
        onClick={onResetStation}
        className="absolute top-1 right-1 rounded-full bg-white/80 hover:bg-white border border-slate-200 text-slate-400 hover:text-brand-red-primary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        style={{
          padding: 'min(4px, 1cqmin)',
          width: 'min(24px, 6cqmin)',
          height: 'min(24px, 6cqmin)',
        }}
        aria-label={`Reset ${station.title}`}
        title={`Reset ${station.title}`}
      >
        <RotateCcw
          style={{
            width: 'min(12px, 3.5cqmin)',
            height: 'min(12px, 3.5cqmin)',
          }}
        />
      </button>

      <div
        className="flex items-start relative z-10"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <div
          className="shrink-0 rounded-xl bg-white/90 border border-white shadow-sm flex items-center justify-center"
          style={{
            width: 'min(44px, 12cqmin)',
            height: 'min(44px, 12cqmin)',
          }}
        >
          {renderCatalystIcon(iconSource, 'min(28px, 8cqmin)', '')}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div
            className="font-black text-slate-900 leading-tight truncate"
            style={{
              fontSize: 'min(16px, 6cqmin)',
              color: accent,
            }}
            title={station.title}
          >
            {station.title || 'Untitled'}
          </div>
          {station.description && (
            <div
              className="text-slate-500 leading-tight line-clamp-2"
              style={{ fontSize: 'min(11px, 4cqmin)' }}
            >
              {station.description}
            </div>
          )}
          <div
            className="text-white rounded-full font-black w-max mt-1"
            style={{
              backgroundColor: accent,
              fontSize: 'min(11px, 3.5cqmin)',
              padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
            }}
          >
            {capLabel}
          </div>
        </div>
      </div>

      <div
        className="flex-1 flex flex-wrap content-start overflow-y-auto custom-scrollbar relative z-10"
        style={{
          gap: 'min(6px, 1.5cqmin)',
          marginTop: 'min(10px, 2cqmin)',
          paddingRight: 'min(4px, 1cqmin)',
        }}
      >
        {members.length === 0 && (
          <div
            className="w-full h-full flex items-center justify-center text-slate-400 italic"
            style={{ fontSize: 'min(11px, 4cqmin)' }}
          >
            <LayoutGrid
              style={{
                width: 'min(14px, 4cqmin)',
                height: 'min(14px, 4cqmin)',
                marginRight: 'min(6px, 1.5cqmin)',
              }}
            />
            Drop students here
          </div>
        )}
        {members.map((student) => (
          <DraggableStudent
            key={student}
            id={student}
            name={student}
            onClick={() => onUnassign(student)}
            className={studentChipClass}
            style={studentChipStyle}
          />
        ))}
      </div>
    </DroppableZone>
  );
};
