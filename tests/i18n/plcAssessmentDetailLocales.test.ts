import { describe, expect, it } from 'vitest';
import de from '@/locales/de.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

describe.each([
  ['en', en],
  ['de', de],
  ['es', es],
  ['fr', fr],
] as const)('%s locale — PLC assessment question counts', (code, locale) => {
  it('interpolates served, graded, and answered counts', () => {
    const value = locale.plcDashboard.assessmentDetail.gradedOfAnswered;

    expect(value, `${code} is missing the served count`).toContain(
      '{{served}}'
    );
    expect(value, `${code} is missing the graded count`).toContain(
      '{{graded}}'
    );
    expect(value, `${code} is missing the answered count`).toContain(
      '{{answered}}'
    );
  });
});
