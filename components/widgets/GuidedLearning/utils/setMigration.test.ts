import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import {
  GL_SET_SCHEMA_VERSION,
  SlideMeasurement,
  convertLegacySpotlightRadii,
  isGuidedLearningSetV2,
  isGuidedLearningSetV3,
  requiredSchemaVersion,
  stepUsesSpotlight,
} from './setMigration';
import {
  calculateImageFootprint,
  toContainerSpotlightRadiusPct,
  toImageOffset,
} from './imageUtils';

describe('isGuidedLearningSetV2', () => {
  it('treats absent and v1 schemaVersion as legacy', () => {
    expect(isGuidedLearningSetV2({})).toBe(false);
    expect(isGuidedLearningSetV2({ schemaVersion: undefined })).toBe(false);
    expect(isGuidedLearningSetV2({ schemaVersion: 1 })).toBe(false);
  });

  it('treats v2 and above as v2', () => {
    expect(isGuidedLearningSetV2({ schemaVersion: 2 })).toBe(true);
    expect(isGuidedLearningSetV2({ schemaVersion: 3 })).toBe(true);
    expect(GL_SET_SCHEMA_VERSION).toBe(5);
  });
});

describe('requiredSchemaVersion', () => {
  const step = (
    over: Partial<GuidedLearningStep> = {}
  ): GuidedLearningStep => ({
    id: 's',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'tooltip',
    ...over,
  });

  it('stays at 3 when no step uses callout styling', () => {
    expect(requiredSchemaVersion({ steps: [] })).toBe(3);
    expect(
      requiredSchemaVersion({
        steps: [step({ calloutPin: { xPct: 1, yPct: 2 } })],
      })
    ).toBe(3);
  });

  it('ignores leftovers on non-callout steps and an explicit dark tone', () => {
    expect(
      requiredSchemaVersion({
        steps: [
          step({ interactionType: 'question', calloutScale: 2 }),
          step({ interactionType: 'pan-zoom', calloutWidthPct: 30 }),
          step({ calloutTone: 'dark' }),
        ],
      })
    ).toBe(3);
    expect(
      requiredSchemaVersion({
        steps: [
          step({
            interactionType: 'spotlight',
            showOverlay: 'popover',
            calloutWidthPct: 30,
          }),
        ],
      })
    ).toBe(4);
  });

  it.each([
    { calloutWidthPct: 40 },
    { calloutScale: 1.25 },
    { calloutTone: 'light' as const },
  ])('is 4 once a step sets %o', (over) => {
    expect(requiredSchemaVersion({ steps: [step(), step(over)] })).toBe(4);
  });

  it('is 5 once a callout step has a box, and ignores a box on other types', () => {
    const calloutBox = { xPct: 10, yPct: 10, wPct: 30, hPct: 20 };
    expect(
      requiredSchemaVersion({
        steps: [step({ calloutTone: 'light' }), step({ calloutBox })],
      })
    ).toBe(5);
    expect(
      requiredSchemaVersion({
        steps: [step({ interactionType: 'question', calloutBox })],
      })
    ).toBe(3);
  });
});

describe('isGuidedLearningSetV3', () => {
  it('is true only from schemaVersion 3', () => {
    expect(isGuidedLearningSetV3({})).toBe(false);
    expect(isGuidedLearningSetV3({ schemaVersion: 2 })).toBe(false);
    expect(isGuidedLearningSetV3({ schemaVersion: 3 })).toBe(true);
  });
});

function makeStep(over: Partial<GuidedLearningStep>): GuidedLearningStep {
  return {
    id: 's1',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'spotlight',
    showOverlay: 'none',
    ...over,
  };
}

// Wide 1600x900 image letterboxed in a tall 300x400 container.
function measurement(): SlideMeasurement {
  const containerWidth = 300;
  const containerHeight = 400;
  const imgOffset = toImageOffset(
    calculateImageFootprint(1600, 900, containerWidth, containerHeight),
    containerWidth,
    containerHeight
  );
  if (!imgOffset) throw new Error('unmeasured fixture');
  return { imgOffset, containerWidth, containerHeight };
}

describe('stepUsesSpotlight', () => {
  it('matches spotlight and pan-zoom-spotlight only', () => {
    expect(stepUsesSpotlight(makeStep({}))).toBe(true);
    expect(
      stepUsesSpotlight(makeStep({ interactionType: 'pan-zoom-spotlight' }))
    ).toBe(true);
    expect(stepUsesSpotlight(makeStep({ interactionType: 'tooltip' }))).toBe(
      false
    );
  });
});

describe('convertLegacySpotlightRadii', () => {
  it('rewrites spotlight radii so the rendered container radius is preserved', () => {
    const m = measurement();
    const steps = [makeStep({ spotlightRadius: 20 })];
    const converted = convertLegacySpotlightRadii(steps, new Map([[0, m]]));
    if (!converted) throw new Error('expected conversion to succeed');
    const radius = converted[0].spotlightRadius ?? 0;
    // v2 player math renders the converted radius at the legacy size.
    expect(
      toContainerSpotlightRadiusPct(
        radius,
        m.imgOffset,
        m.containerWidth,
        m.containerHeight
      )
    ).toBeCloseTo(20, 1);
  });

  it('materializes the implicit default radius of 25', () => {
    const m = measurement();
    const converted = convertLegacySpotlightRadii(
      [makeStep({})],
      new Map([[0, m]])
    );
    expect(converted?.[0].spotlightRadius).toBeCloseTo((25 * 300) / 168.75, 1);
  });

  it('passes non-spotlight steps through untouched', () => {
    const step = makeStep({ interactionType: 'tooltip' });
    const converted = convertLegacySpotlightRadii([step], new Map());
    expect(converted).toEqual([step]);
    expect(converted?.[0]).toBe(step);
  });

  it('returns null when a spotlight step slide is unmeasured', () => {
    const steps = [makeStep({ imageIndex: 1 })];
    expect(
      convertLegacySpotlightRadii(steps, new Map([[0, measurement()]]))
    ).toBeNull();
  });
});
