import React from 'react';
import { Station } from '@/types';
import { DroppableZone } from '@/components/widgets/LunchCount/components/DroppableZone';
import { DraggableStudent } from '@/components/widgets/LunchCount/components/DraggableStudent';
import { renderCatalystIcon } from '@/components/widgets/Catalyst/catalystHelpers';
import { LayoutGrid, RotateCcw } from 'lucide-react';
import { hexToRgba } from '@/utils/styles';
import { studentChipClass, studentChipStyle } from './studentChip';
import { getAccessibleAccentText } from './accentText';

interface StationCardProps {
  station: Station;
  members: string[];
  onUnassign: (student: string) => void;
  onResetStation: () => void;
  isFull: boolean;
  /** Active typography class (from `getFontClass`) inherited from widget config. */
  fontClassName?: string;
  /** Accessible accent override is computed locally; this is text color for body copy (description). */
  bodyTextColor?: string;
  /** Surface color from widget appearance settings (cardColor). */
  cardColor?: string;
  /** Surface opacity from widget appearance settings (cardOpacity). */
  cardOpacity?: number;
}

export const StationCard: React.FC<StationCardProps> = ({
  station,
  members,
  onUnassign,
  onResetStation,
  isFull,
  fontClassName = '',
  bodyTextColor,
  cardColor = '#f8fafc',
  cardOpacity = 0.4,
}) => {
  const accent = station.color?.trim() ? station.color : '#10b981';
  // The card surface uses the station accent (preserving per-station color
  // coding) and applies `cardOpacity` directly — the same direct mapping the
  // widget header and unassigned bucket use against `cardColor`. Keeping the
  // alpha mapping uniform across surfaces means the "Card surface" slider
  // behaves the same everywhere in the widget.
  const clampedOpacity = Math.max(0, Math.min(1, cardOpacity));
  // Hard cap the visible surface alpha so the dashed accent border and the
  // solid-accent count badge never fully merge into the background at the top
  // of the slider's range.
  const SURFACE_ALPHA_CAP = 0.85;
  const surfaceAlpha = Math.min(SURFACE_ALPHA_CAP, clampedOpacity);
  const surface = hexToRgba(accent, surfaceAlpha);
  const tintHover = hexToRgba(
    accent,
    Math.min(SURFACE_ALPHA_CAP, surfaceAlpha + 0.15)
  );
  // `getAccessibleAccentText` darkens the accent until it contrasts with white
  // — accurate while the card is mostly transparent (low opacity → near-white
  // surface). Once the surface gets dark/saturated the darkened accent text
  // collides with its own background, so flip to white above ~50% opacity.
  const titleColor =
    surfaceAlpha > 0.5 ? '#ffffff' : getAccessibleAccentText(accent);
  const capLabel =
    station.maxStudents != null
      ? `${members.length} / ${station.maxStudents}`
      : `${members.length}`;
  const iconSource = station.imageUrl?.trim()
    ? station.imageUrl
    : station.iconName?.trim()
      ? station.iconName
      : 'LayoutGrid';
  // Chip column overlay — an internal readability layer (not a user-visible
  // "card surface"). It uses `cardColor` and is deliberately bumped above
  // `cardOpacity` so chip text stays legible even when the accent tint behind
  // it is heavy.
  const chipSurface = hexToRgba(cardColor, Math.min(1, clampedOpacity + 0.25));

  return (
    <DroppableZone
      id={`station:${station.id}`}
      className={`relative rounded-2xl border-2 border-dashed flex transition-all group h-full overflow-hidden ${fontClassName}`}
      style={{
        borderColor: accent,
        backgroundColor: surface,
        padding: 'min(10px, 2cqmin)',
        gap: 'min(10px, 2cqmin)',
      }}
      activeClassName={isFull ? '' : 'border-solid scale-[1.02]'}
    >
      {/* Subtle hover background that respects the accent color */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ backgroundColor: tintHover }}
      />

      {/*
        Per-station reset button — z-30 keeps it above the icon/title column
        (z-10) and the chip column (z-10), otherwise the column wrappers sit
        on top of the absolute button and swallow clicks.
      */}
      <button
        type="button"
        onClick={onResetStation}
        className="absolute top-1 right-1 z-30 rounded-full bg-white/90 hover:bg-white border border-slate-200 text-slate-500 hover:text-brand-red-primary opacity-70 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary transition-all"
        style={{
          padding: 'min(5px, 1.2cqmin)',
          width: 'min(28px, 7cqmin)',
          height: 'min(28px, 7cqmin)',
        }}
        aria-label={`Reset students in ${station.title || 'this station'}`}
        title={`Reset students in ${station.title || 'this station'}`}
      >
        <RotateCcw
          aria-hidden
          style={{
            width: 'min(14px, 3.8cqmin)',
            height: 'min(14px, 3.8cqmin)',
          }}
        />
      </button>

      {/* LEFT COLUMN — icon, title, description, count badge.
          Sized larger so kids can read the station from across the room. */}
      <div
        className="relative z-10 flex flex-col items-center justify-center text-center min-w-0"
        style={{
          flexBasis: '50%',
          flexGrow: 1,
          flexShrink: 1,
          gap: 'min(6px, 1.5cqmin)',
          // Reserve space for the absolute reset button so the icon doesn't
          // visually collide with it.
          paddingTop: 'min(20px, 5cqmin)',
        }}
      >
        <div
          className="shrink-0 rounded-2xl bg-white/90 border border-white shadow-sm flex items-center justify-center"
          style={{
            width: 'min(96px, 28cqmin)',
            height: 'min(96px, 28cqmin)',
          }}
        >
          {renderCatalystIcon(iconSource, 'min(64px, 20cqmin)', '')}
        </div>
        <div
          className="font-black leading-tight w-full line-clamp-2"
          style={{
            fontSize: 'min(28px, 11cqmin)',
            color: titleColor,
          }}
          title={station.title}
        >
          {station.title || 'Untitled'}
        </div>
        {station.description && (
          <div
            className="leading-tight w-full line-clamp-2"
            style={{
              fontSize: 'min(13px, 5cqmin)',
              color: bodyTextColor ?? '#64748b',
            }}
          >
            {station.description}
          </div>
        )}
        <div
          className="text-white rounded-full font-black w-max"
          style={{
            backgroundColor: accent,
            fontSize: 'min(13px, 4.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(10px, 2.5cqmin)',
          }}
        >
          {capLabel}
        </div>
      </div>

      {/* RIGHT COLUMN — student chips, stacked top-to-bottom in a grid that
          auto-fills more columns as the card grows wider (single column on
          narrow cards). */}
      <div
        className="relative z-10 flex flex-col rounded-xl overflow-hidden"
        style={{
          flexBasis: '50%',
          flexGrow: 1,
          flexShrink: 1,
          backgroundColor: chipSurface,
          // Top padding reserves room for the absolute reset button (which
          // sits over this column's top-right corner) so the first chip row
          // never renders underneath it.
          padding: 'min(20px, 5cqmin) min(8px, 2cqmin) min(8px, 2cqmin)',
        }}
      >
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ paddingRight: 'min(4px, 1cqmin)' }}
        >
          {members.length === 0 ? (
            <div
              className="w-full h-full flex items-center justify-center text-slate-400 italic text-center"
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
          ) : (
            <div
              className="grid w-full content-start"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                // Auto-fill as many columns as the chip column width allows.
                // The per-chip min-width keeps each chip wide enough to read
                // a student name; on narrow cards this naturally collapses
                // to a single column.
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(80px, 30cqmin), 1fr))',
              }}
            >
              {members.map((student) => (
                <DraggableStudent
                  key={student}
                  id={student}
                  name={student}
                  onClick={() => onUnassign(student)}
                  className={`${studentChipClass} w-full justify-center text-center`}
                  style={{
                    ...studentChipStyle,
                    ...(bodyTextColor ? { color: bodyTextColor } : {}),
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DroppableZone>
  );
};
