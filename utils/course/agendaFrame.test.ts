import { describe, expect, it } from 'vitest';
import {
  agendaAspect,
  aspectChanged,
  aspectFromPageSize,
  DEFAULT_AGENDA_ASPECT,
  previewFrameStyle,
} from './agendaFrame';
import { cleanCourseAgenda } from './contract';

const EMU = (w: number, h: number) => ({
  width: { magnitude: w, unit: 'EMU' },
  height: { magnitude: h, unit: 'EMU' },
});

describe('agenda frame shape', () => {
  it('reads the Slides page size as width over height', () => {
    expect(aspectFromPageSize(EMU(9144000, 5143500))).toBeCloseTo(16 / 9, 3);
    expect(aspectFromPageSize(EMU(9144000, 6858000))).toBeCloseTo(4 / 3, 3);
    expect(aspectFromPageSize(EMU(7772400, 10058400))).toBeCloseTo(0.7727, 3);
  });

  it('gives up on a missing or absurd page size', () => {
    expect(aspectFromPageSize(undefined)).toBeNull();
    expect(aspectFromPageSize({ width: { magnitude: 10 } })).toBeNull();
    expect(aspectFromPageSize(EMU(100, 0))).toBeNull();
    expect(aspectFromPageSize(EMU(1000, 1))).toBeNull();
  });

  it('falls back to 16:9 for a deck whose shape was never read', () => {
    expect(agendaAspect(null)).toBe(DEFAULT_AGENDA_ASPECT);
    expect(agendaAspect({})).toBe(DEFAULT_AGENDA_ASPECT);
    expect(agendaAspect({ aspect: 99 })).toBe(DEFAULT_AGENDA_ASPECT);
    expect(agendaAspect({ aspect: 1.3333 })).toBe(1.3333);
  });

  it('adds the viewer bar to the preview frame height', () => {
    expect(previewFrameStyle(1.5).height).toBe(
      'calc((100cqw - 2px) / 1.5 + 38px)'
    );
  });

  it('saves a shape only when it moved', () => {
    expect(aspectChanged(undefined, 1.5)).toBe(true);
    expect(aspectChanged(1.5, 1.5005)).toBe(false);
    expect(aspectChanged(1.7778, 1.3333)).toBe(true);
  });

  it('keeps a valid shape on the Agenda and drops a bad one', () => {
    expect(
      cleanCourseAgenda({
        fileId: 'deck1234567890',
        title: 'A',
        aspect: 1.333333,
      })
    ).toEqual({ fileId: 'deck1234567890', title: 'A', aspect: 1.3333 });
    expect(
      cleanCourseAgenda({
        fileId: 'deck1234567890',
        title: 'A',
        aspect: 'wide',
      })
    ).toEqual({ fileId: 'deck1234567890', title: 'A' });
  });
});
