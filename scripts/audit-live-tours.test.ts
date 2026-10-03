import { describe, it, expect } from 'vitest';
import { classifySet, parseArgs } from './audit-live-tours.mjs';

const anchored = (id: string, imageIndex = 0) => ({
  id,
  imageIndex,
  tour: { anchor: 'dock', action: 'click' },
});

describe('classifySet', () => {
  it('skips sets with no anchored step and no hasLiveTour flag', () => {
    expect(
      classifySet('a', { title: 'Plain', steps: [{ id: 's1', imageIndex: 0 }] })
    ).toBeNull();
  });

  it('marks a fully anchored set convertible and lists missing images', () => {
    const row = classifySet('t1', {
      title: 'Timer tour',
      helpCenter: true,
      mode: 'structured',
      imageUrls: ['https://img/0.png'],
      steps: [anchored('s1', 0), anchored('s2', 1)],
    });
    expect(row).toMatchObject({
      id: 't1',
      title: 'Timer tour',
      helpCenter: true,
      mode: 'structured',
      stepCount: 2,
      withoutAnchor: [],
      withoutImage: ['2 (s2)'],
      convertible: true,
      needsUpdate: true,
    });
  });

  it('lists a partly anchored set without converting it', () => {
    const row = classifySet('t2', {
      title: 'Mixed',
      imageUrls: ['u0', 'u1'],
      steps: [anchored('s1'), { id: 's2', imageIndex: 1 }, { id: 's3' }],
    });
    expect(row?.convertible).toBe(false);
    expect(row?.needsUpdate).toBe(false);
    expect(row?.withoutAnchor).toEqual(['2 (s2)', '3 (s3)']);
    expect(row?.withoutImage).toEqual([]);
  });

  it('treats a blank anchor as missing', () => {
    const row = classifySet('t3', {
      hasLiveTour: true,
      steps: [{ id: 's1', tour: { anchor: '  ', action: 'click' } }],
    });
    expect(row?.withoutAnchor).toEqual(['1 (s1)']);
    expect(row?.convertible).toBe(false);
  });

  it('includes a flagged set with no steps but never converts it', () => {
    const row = classifySet('t4', { hasLiveTour: true });
    expect(row).toMatchObject({
      title: '(untitled)',
      mode: '(none)',
      stepCount: 0,
      convertible: false,
    });
  });

  it('needs no update once mode is tour and hasLiveTour is set', () => {
    const row = classifySet('t5', {
      mode: 'tour',
      hasLiveTour: true,
      imageUrls: ['u0'],
      steps: [anchored('s1')],
    });
    expect(row?.convertible).toBe(true);
    expect(row?.needsUpdate).toBe(false);
  });
});

describe('parseArgs', () => {
  it('defaults to a dry run and maps project aliases', () => {
    expect(parseArgs(['--project', 'prod'])).toEqual({
      apply: false,
      project: 'spartboard',
      confirmProd: false,
      help: false,
    });
    expect(parseArgs(['--project', 'dev', '--apply']).apply).toBe(true);
    expect(parseArgs(['--project', 'dev']).project).toBe('spartboard-dev');
  });

  it('rejects unknown projects and reads --confirm-prod', () => {
    expect(parseArgs(['--project', 'prd']).project).toBe('invalid');
    expect(
      parseArgs(['--project', 'prod', '--apply', '--confirm-prod']).confirmProd
    ).toBe(true);
  });
});
