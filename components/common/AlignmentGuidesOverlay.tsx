import { type FC, useSyncExternalStore } from 'react';
import { useDashboardCanvasSelector } from '@/context/dashboardCanvasStore';
import { Z_INDEX } from '@/config/zIndex';
import {
  getAlignmentGuides,
  subscribeAlignmentGuides,
} from './alignmentGuidesStore';

const CAP = 6;

/** Draws alignment lines and equal-gap markers in board (world) coordinates. */
export const AlignmentGuidesOverlay: FC = () => {
  const guides = useSyncExternalStore(
    subscribeAlignmentGuides,
    getAlignmentGuides
  );
  const zoom = useDashboardCanvasSelector((s) => s.zoom);
  if (guides.lines.length === 0 && guides.spacing.length === 0) return null;
  const t = 1 / zoom;
  const cap = CAP / zoom;

  return (
    <div
      aria-hidden
      data-testid="alignment-guides"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: Z_INDEX.snapPreview }}
    >
      {guides.lines.map((l) => (
        <div
          key={`l-${l.axis}-${l.pos}`}
          className="absolute bg-rose-500"
          style={
            l.axis === 'x'
              ? {
                  left: l.pos - t / 2,
                  top: l.from,
                  width: t,
                  height: l.to - l.from,
                }
              : {
                  top: l.pos - t / 2,
                  left: l.from,
                  height: t,
                  width: l.to - l.from,
                }
          }
        />
      ))}
      {guides.spacing.map((s) => {
        const len = s.to - s.from;
        const horizontal = s.axis === 'x';
        return (
          <div
            key={`s-${s.axis}-${s.from}-${s.at}`}
            className="absolute"
            style={
              horizontal
                ? { left: s.from, top: s.at - cap / 2, width: len, height: cap }
                : { top: s.from, left: s.at - cap / 2, height: len, width: cap }
            }
          >
            <div
              className="absolute bg-rose-500"
              style={
                horizontal
                  ? { left: 0, right: 0, top: cap / 2 - t / 2, height: t }
                  : { top: 0, bottom: 0, left: cap / 2 - t / 2, width: t }
              }
            />
            <div
              className="absolute bg-rose-500"
              style={
                horizontal
                  ? { left: 0, top: 0, width: t, height: cap }
                  : { top: 0, left: 0, height: t, width: cap }
              }
            />
            <div
              className="absolute bg-rose-500"
              style={
                horizontal
                  ? { right: 0, top: 0, width: t, height: cap }
                  : { bottom: 0, left: 0, height: t, width: cap }
              }
            />
          </div>
        );
      })}
    </div>
  );
};
