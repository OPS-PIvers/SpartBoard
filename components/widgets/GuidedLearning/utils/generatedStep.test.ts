import { describe, expect, it } from 'vitest';
import { cleanGeneratedStep } from './generatedStep';
import { requiredSchemaVersion } from './setMigration';

const base = {
  id: 's1',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'spotlight' as const,
};

describe('cleanGeneratedStep', () => {
  it('keeps a spotlight tooltip with a rect region and marks it an AI draft', () => {
    const step = cleanGeneratedStep(
      {
        label: 'Save button',
        text: 'Click **Save**.',
        showOverlay: 'tooltip',
        region: { shape: 'rect', wPct: 10, hPct: 6, cornerPct: 20 },
        hideStepNumber: true,
        tour: { anchor: 'dock.open-tools', action: 'click' },
      },
      base
    );
    expect(step).toEqual({
      ...base,
      aiDraft: true,
      label: 'Save button',
      text: 'Click **Save**.',
      showOverlay: 'tooltip',
      region: { shape: 'rect', wPct: 10, hPct: 6, cornerPct: 20 },
    });
  });

  it('pulls a region that runs off the image back inside it', () => {
    const step = cleanGeneratedStep(
      { region: { shape: 'ellipse', wPct: 20, hPct: 20, cornerPct: 10 } },
      { ...base, xPct: 95, yPct: 2 }
    );
    expect(step.region).toEqual({ shape: 'ellipse', wPct: 20, hPct: 20 });
    expect([step.xPct, step.yPct]).toEqual([90, 10]);
  });

  it('drops polygons, malformed regions and regions on questions', () => {
    expect(
      cleanGeneratedStep(
        { region: { shape: 'polygon', wPct: 5, hPct: 5 } },
        base
      ).region
    ).toBeUndefined();
    expect(
      cleanGeneratedStep({ region: { shape: 'rect', wPct: '5' } }, base).region
    ).toBeUndefined();
    expect(
      cleanGeneratedStep(
        { region: { shape: 'rect', wPct: 5, hPct: 5 } },
        { ...base, interactionType: 'question' }
      ).region
    ).toBeUndefined();
  });

  it('keeps a banner tone only on a banner overlay', () => {
    expect(
      cleanGeneratedStep({ showOverlay: 'banner', bannerTone: 'red' }, base)
    ).toMatchObject({ showOverlay: 'banner', bannerTone: 'red' });
    expect(
      cleanGeneratedStep({ showOverlay: 'tooltip', bannerTone: 'red' }, base)
        .bannerTone
    ).toBeUndefined();
    expect(
      cleanGeneratedStep({ showOverlay: 'banner', bannerTone: 'pink' }, base)
        .bannerTone
    ).toBeUndefined();
    expect(
      cleanGeneratedStep(
        { showOverlay: 'banner' },
        { ...base, interactionType: 'text-popover' }
      ).showOverlay
    ).toBe('none');
  });

  it('keeps callout boxes and tones only on steps that draw a callout', () => {
    const box = { xPct: 60, yPct: 10, wPct: 30, hPct: 15 };
    const popover = cleanGeneratedStep(
      { calloutBox: box, calloutTone: 'accent' },
      { ...base, interactionType: 'text-popover' }
    );
    expect(popover).toMatchObject({ calloutBox: box, calloutTone: 'accent' });
    expect(requiredSchemaVersion({ steps: [popover] })).toBe(5);
    const noCallout = cleanGeneratedStep(
      { showOverlay: 'none', calloutBox: box, calloutTone: 'light' },
      base
    );
    expect(noCallout.calloutBox).toBeUndefined();
    expect(noCallout.calloutTone).toBeUndefined();
    expect(requiredSchemaVersion({ steps: [noCallout] })).toBe(3);
    expect(
      cleanGeneratedStep(
        { calloutBox: { xPct: 0, yPct: 0, wPct: 0, hPct: 10 } },
        { ...base, interactionType: 'tooltip' }
      ).calloutBox
    ).toBeUndefined();
  });

  it('clamps zoom and spotlight size to the Studio ranges and keeps a hidden cursor', () => {
    const step = cleanGeneratedStep(
      { panZoomScale: 12, spotlightRadius: 1, cursor: { hide: true } },
      { ...base, interactionType: 'pan-zoom-spotlight' }
    );
    expect(step).toMatchObject({
      panZoomScale: 6,
      spotlightRadius: 5,
      cursor: { hide: true },
    });
  });
});
