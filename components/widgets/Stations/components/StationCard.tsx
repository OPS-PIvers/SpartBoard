import React from 'react';
import { Station } from '@/types';
import { DroppableZone } from '@/components/widgets/LunchCount/components/DroppableZone';
import { DraggableStudent } from '@/components/widgets/LunchCount/components/DraggableStudent';
import { renderCatalystIcon } from '@/components/widgets/Catalyst/catalystHelpers';
import { LayoutGrid, RotateCcw } from 'lucide-react';
import { hexToRgba } from '@/utils/styles';
import { studentChipClass, studentChipStyle } from './studentChip';

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
  const capLabel =
    station.maxStudents != null
      ? `${members.length} / ${station.maxStudents}`
      : `${members.length}`;
  const trimmedImageUrl = station.imageUrl?.trim();
  const hasImage = Boolean(trimmedImageUrl);
  const iconName = station.iconName?.trim() ? station.iconName : 'LayoutGrid';
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
        padding: 'min(10px, 4cqmin)',
        gap: 'min(10px, 4cqmin)',
        // Make the card itself a container-query container so the title,
        // description, chips, and badges inside size against the CARD's
        // dimensions rather than the widget's. This is what lets the title
        // shrink as more stations are added (each card gets narrower) and
        // the chips fit without scroll.
        containerType: 'size',
      }}
      activeClassName={isFull ? '' : 'border-solid scale-[1.02]'}
    >
      {/* LEFT COLUMN — hero (image or giant icon) fills the upper area;
          a dark translucent plate is pinned to the bottom edge (aligned with
          the chip column's bottom) carrying title / description / count. In
          icon mode the lucide glyph fills the area above the plate so it
          reads in full; in image mode the photo fills edge-to-edge and the
          plate floats over its bottom. */}
      <div
        className="relative z-10 flex flex-col items-center justify-end text-center min-w-0 rounded-xl overflow-hidden"
        style={{
          flexBasis: '50%',
          flexGrow: 1,
          flexShrink: 1,
        }}
      >
        {hasImage ? (
          <img
            src={trimmedImageUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div
            aria-hidden
            className="relative z-0 flex-1 min-h-0 w-full flex items-center justify-center pointer-events-none overflow-hidden"
            style={{
              color: 'rgba(255, 255, 255, 0.95)',
              padding: 'min(8px, 4cqmin)',
            }}
          >
            {renderCatalystIcon(iconName, '100%', 'max-w-full max-h-full')}
          </div>
        )}
        <div
          className="relative z-10 flex flex-col items-center justify-center w-full"
          style={{
            gap: 'min(4px, 2cqmin)',
            // Plate fills the column edge-to-edge at the bottom. Its rounded
            // corners match the column's rounded corners — the bottom corners
            // overlap the column's rounded bottom for a clean drawer look,
            // and the top corners curve into the icon hero area above.
            margin: 0,
            padding: 'min(8px, 4cqmin) min(10px, 5cqmin)',
            backgroundColor: 'rgba(15, 23, 42, 0.42)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            borderRadius: '0.75rem',
          }}
        >
          <div
            className="font-black leading-tight w-full line-clamp-2 break-words"
            style={{
              // Title cap dropped from 28 → 22 so it doesn't dominate the
              // card at typical widget sizes; the lower cqmin coefficient
              // keeps the cap reachable on wider cards without ballooning.
              fontSize: 'min(22px, 14cqmin)',
              color: '#ffffff',
            }}
            title={station.title}
          >
            {station.title || 'Untitled'}
          </div>
          {station.description && (
            <div
              className="leading-tight w-full line-clamp-3 break-words"
              style={{
                fontSize: 'min(11px, 5.5cqmin)',
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: 600,
              }}
            >
              {station.description}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN — student chips packed via flex-wrap so every name stays
          visible at narrow widget widths. Chips size to their content; only as
          a last-resort fallback (very tall rosters in tiny widgets) does the
          inner block scroll. */}
      <div
        className="relative z-10 flex flex-col rounded-xl overflow-hidden"
        style={{
          flexBasis: '50%',
          flexGrow: 1,
          flexShrink: 1,
          backgroundColor: chipSurface,
          // Top padding reserves room for the absolute count badge (top-left)
          // and reset button (top-right) plus extra breathing room before the
          // first chip row.
          padding: 'min(36px, 16cqmin) min(8px, 4cqmin) min(8px, 4cqmin)',
        }}
      >
        <div
          className="absolute top-1 left-1 z-20 text-white rounded-full font-black tabular-nums pointer-events-none flex items-center"
          style={{
            backgroundColor: accent,
            fontSize: 'min(11px, 7cqmin)',
            padding: 'min(2px, 1cqmin) min(8px, 4cqmin)',
            height: 'min(24px, 12cqmin)',
          }}
          aria-label={`${members.length} students assigned${station.maxStudents != null ? ` of ${station.maxStudents} max` : ''}`}
        >
          {capLabel}
        </div>
        {/*
          Per-station reset button — sits in the chip column's top-right
          corner, mirroring the count badge in the top-left. Same accent-pill
          treatment so the two corners read as a matched pair; hover flips it
          to brand-red to signal the destructive action.
        */}
        <button
          type="button"
          onClick={onResetStation}
          className="absolute top-1 right-1 z-30 rounded-full text-white font-black flex items-center justify-center hover:bg-brand-red-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary transition-colors"
          style={{
            backgroundColor: accent,
            width: 'min(24px, 12cqmin)',
            height: 'min(24px, 12cqmin)',
          }}
          aria-label={`Reset students in ${station.title || 'this station'}`}
          title={`Reset students in ${station.title || 'this station'}`}
        >
          <RotateCcw
            aria-hidden
            style={{
              width: 'min(13px, 7cqmin)',
              height: 'min(13px, 7cqmin)',
            }}
          />
        </button>
        <div
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
          style={{ paddingRight: 'min(4px, 2cqmin)' }}
        >
          {members.length === 0 ? (
            <div
              className="w-full h-full flex items-center justify-center text-slate-400 italic text-center"
              style={{ fontSize: 'min(11px, 7cqmin)' }}
            >
              <LayoutGrid
                style={{
                  width: 'min(14px, 7cqmin)',
                  height: 'min(14px, 7cqmin)',
                  marginRight: 'min(6px, 3cqmin)',
                }}
              />
              Drop students here
            </div>
          ) : (
            <div
              className="flex flex-wrap content-start justify-center w-full"
              style={{ gap: 'min(5px, 2cqmin)' }}
            >
              {members.map((student) => (
                <DraggableStudent
                  key={student}
                  id={student}
                  name={student}
                  onClick={() => onUnassign(student)}
                  className={`${studentChipClass} justify-center text-center`}
                  style={{
                    // Override studentChipStyle's widget-relative cqmin values
                    // with card-relative ones since the card is now its own
                    // container query container. Chips stay content-sized and
                    // flex-wrap onto subsequent rows as space allows — they
                    // never stretch to fill leftover row space.
                    ...studentChipStyle,
                    fontSize: 'min(13px, 7cqmin)',
                    padding: 'min(2px, 1cqmin) min(6px, 3cqmin)',
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
