import { describe, it, expect, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  createGuidedLearningImportAdapter,
  parseGuidedLearningImport,
  validateGuidedLearningImport,
} from './guidedLearningImportAdapter';

function makeSet(
  overrides: Partial<GuidedLearningSet> = {}
): GuidedLearningSet {
  return {
    id: 'set-1',
    title: 'Water Cycle',
    imageUrls: ['data:image/png;base64,aGVsbG8='],
    steps: [
      {
        id: 's1',
        xPct: 50,
        yPct: 50,
        imageIndex: 0,
        interactionType: 'tooltip',
        text: 'Evaporation',
      },
    ],
    mode: 'explore',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('parseGuidedLearningImport', () => {
  it('parses a pasted json payload', async () => {
    const result = await parseGuidedLearningImport({
      kind: 'json',
      text: JSON.stringify(makeSet()),
    });
    expect(result.data.title).toBe('Water Cycle');
    expect(result.warnings).toEqual([]);
  });

  it('parses an uploaded file payload', async () => {
    // jsdom's File lacks .text(); a minimal stand-in is enough here.
    const file = {
      name: 'water.gl.json',
      text: () => Promise.resolve(JSON.stringify(makeSet())),
    } as unknown as File;
    const result = await parseGuidedLearningImport({ kind: 'file', file });
    expect(result.data.steps).toHaveLength(1);
  });

  it('rejects unsupported source kinds', async () => {
    await expect(
      parseGuidedLearningImport({ kind: 'csv', text: 'a,b' })
    ).rejects.toThrow(/gl\.json/);
  });
});

describe('validateGuidedLearningImport', () => {
  it('passes a well-formed set', () => {
    expect(validateGuidedLearningImport(makeSet())).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('requires title, images, and steps', () => {
    const result = validateGuidedLearningImport(
      makeSet({ title: ' ', imageUrls: [], steps: [] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('requires numeric hotspot coordinates', () => {
    const bad = makeSet();
    bad.steps[0].xPct = Number.NaN;
    const result = validateGuidedLearningImport(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/xPct/);
  });

  it('rejects out-of-range hotspot coordinates', () => {
    const bad = makeSet();
    bad.steps[0].xPct = 120;
    const result = validateGuidedLearningImport(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/between 0 and 100/);
  });

  it('rejects blob: slide urls', () => {
    const result = validateGuidedLearningImport(
      makeSet({ imageUrls: ['blob:https://app/xyz'] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/blob/);
  });

  it('rejects a non-string imageUrls entry with a friendly message, not a crash', () => {
    const result = validateGuidedLearningImport(
      makeSet({
        imageUrls: [123 as unknown as string],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/must be a string/);
  });

  it('rejects an unknown mode', () => {
    const result = validateGuidedLearningImport(
      makeSet({ mode: 'freestyle' as GuidedLearningSet['mode'] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/structured/);
  });

  it('rejects unknown interaction types', () => {
    const bad = makeSet();
    bad.steps[0].interactionType =
      'dance' as (typeof bad.steps)[0]['interactionType'];
    const result = validateGuidedLearningImport(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/interactionType/);
  });

  it('rejects null steps without throwing', () => {
    const bad = makeSet();
    bad.steps = [null] as unknown as GuidedLearningSet['steps'];
    const result = validateGuidedLearningImport(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/must be an object/);
  });

  it('rejects missing or duplicate step ids', () => {
    const missing = makeSet();
    missing.steps[0].id = '';
    expect(validateGuidedLearningImport(missing).errors.join(' ')).toMatch(
      /non-empty string id/
    );

    const dupes = makeSet();
    dupes.steps = [dupes.steps[0], { ...dupes.steps[0] }];
    expect(validateGuidedLearningImport(dupes).errors.join(' ')).toMatch(
      /unique/
    );
  });
});

describe('createGuidedLearningImportAdapter', () => {
  it('declares json source with paste support and routes save/preview to deps', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const renderPreview = vi.fn().mockReturnValue(null);
    const adapter = createGuidedLearningImportAdapter({ save, renderPreview });

    expect(adapter.supportedSources).toEqual(['json']);
    expect(adapter.supportsJsonPaste).toBe(true);
    expect(adapter.aiAssist).toBeUndefined();

    const set = makeSet();
    expect(adapter.suggestTitle?.(set)).toBe('Water Cycle');
    await adapter.save(set, 'Renamed');
    expect(save).toHaveBeenCalledWith(set, 'Renamed');
    void adapter.renderPreview(set);
    expect(renderPreview).toHaveBeenCalledWith(set);
  });
});
