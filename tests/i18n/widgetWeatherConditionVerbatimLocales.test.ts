import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// ─── EN baseline ─────────────────────────────────────────────────────────────

describe('EN locale — widgets.weather.condition baseline', () => {
  it('has widgets.weather.condition', () => {
    expect(en.widgets.weather).toHaveProperty('condition');
  });
});

// ─── FR: condition must not be verbatim EN ────────────────────────────────────
//
// DE uses "Wetterlage", ES uses "Condición" — FR must not copy the EN value.

describe('FR locale — widgets.weather.condition must not be verbatim EN', () => {
  it('fr: widgets.weather.condition is present', () => {
    expect(fr, 'fr.widgets.weather.condition is missing').toHaveProperty([
      'widgets',
      'weather',
      'condition',
    ]);
  });

  it('fr: widgets.weather.condition is NOT the verbatim English value "Condition"', () => {
    expect(fr.widgets.weather.condition).toBe('Conditions météo');
  });
});

// ─── DE + ES sanity checks — must not regress ────────────────────────────────

describe('DE locale — widgets.weather.condition sanity check (must not regress)', () => {
  it('de: widgets.weather.condition is not verbatim EN ("Wetterlage")', () => {
    expect(
      de.widgets.weather.condition,
      'de.widgets.weather.condition regressed to the English value'
    ).not.toBe(en.widgets.weather.condition);
  });
});

describe('ES locale — widgets.weather.condition sanity check (must not regress)', () => {
  it('es: widgets.weather.condition is not verbatim EN ("Condición")', () => {
    expect(
      es.widgets.weather.condition,
      'es.widgets.weather.condition regressed to the English value'
    ).not.toBe(en.widgets.weather.condition);
  });
});
