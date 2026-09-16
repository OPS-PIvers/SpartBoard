import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const LOCALES = [
  { code: 'en', locale: en as unknown as Record<string, unknown> },
  { code: 'de', locale: de as unknown as Record<string, unknown> },
  { code: 'es', locale: es as unknown as Record<string, unknown> },
  { code: 'fr', locale: fr as unknown as Record<string, unknown> },
];

const KEYS = [
  'group',
  'preset',
  'editHint',
  'custom',
  'change',
  'reset',
  'done',
] as const;

describe.each(LOCALES)('$code locale — pen color strings', ({ locale }) => {
  it('has every penColors key', () => {
    const block = locale.penColors as Record<string, unknown> | undefined;
    for (const key of KEYS) {
      expect(typeof block?.[key]).toBe('string');
      expect((block?.[key] as string).length).toBeGreaterThan(0);
    }
  });

  it('keeps the {{index}} placeholder where the English string has one', () => {
    const block = locale.penColors as Record<string, string>;
    expect(block.preset).toContain('{{index}}');
    expect(block.change).toContain('{{index}}');
  });
});
