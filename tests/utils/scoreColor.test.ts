import { describe, it, expect } from 'vitest';
import { scoreTone, scoreColorClasses } from '@/utils/scoreColor';

describe('scoreTone (unified 80/60 scale)', () => {
  it('maps the threshold boundaries', () => {
    expect(scoreTone(100)).toBe('success');
    expect(scoreTone(80)).toBe('success');
    expect(scoreTone(79)).toBe('warn');
    expect(scoreTone(60)).toBe('warn');
    expect(scoreTone(59)).toBe('danger');
    expect(scoreTone(0)).toBe('danger');
  });
});

describe('scoreColorClasses', () => {
  it('returns emerald / amber / red fragments by tone', () => {
    expect(scoreColorClasses(90).text).toBe('text-emerald-600');
    expect(scoreColorClasses(70).text).toBe('text-amber-600');
    expect(scoreColorClasses(30).text).toBe('text-brand-red-primary');
    expect(scoreColorClasses(90).bar).toBe('bg-emerald-500');
    expect(scoreColorClasses(70).band).toBe('bg-amber-50 border-amber-200');
    expect(scoreColorClasses(30).band).toBe('bg-rose-50 border-rose-200');
  });
});
