// DE locale's `sidebar.nav.plcs` label and `plc.errors.*` namespace used the untranslated
// English acronym "PLC" instead of the project's established "PLG" term (see plcDashboard.subtitle:
// "PLG-Dashboard", sidebar.plcs.*, plcDashboard.members.*) — this is a separate namespace from
// plcDashboard (covered by deDashboardPlgTerminologyLocales.test.ts), so it needs its own scoped
// recursive scan to avoid conflicting with legitimately-scoped "PLC" usage elsewhere in de.json.

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';

/** Dotted path walker — returns the leaf string or undefined. */
function getLeaf(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Recursively collects [path, value] pairs for every string leaf. */
function collectStrings(
  obj: unknown,
  path: string,
  out: Array<[string, string]>
): void {
  if (obj == null || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${key}` : key;
    if (typeof value === 'string') {
      out.push([p, value]);
    } else if (value && typeof value === 'object') {
      collectStrings(value, p, out);
    }
  }
}

const AFFECTED_KEYS: Array<{ path: string; expectedDe: string }> = [
  { path: 'sidebar.nav.plcs', expectedDe: 'Meine PLGs' },
  { path: 'plc.errors.nameRequired', expectedDe: 'PLG-Name erforderlich.' },
  {
    path: 'plc.errors.accountEmailRequired',
    expectedDe: 'Zum Erstellen einer PLG ist eine Konto-E-Mail erforderlich.',
  },
  { path: 'plc.errors.plcNotFound', expectedDe: 'PLG nicht gefunden.' },
  {
    path: 'plc.errors.leadCannotLeave',
    expectedDe:
      'Die Leitung muss die Leitung übertragen, bevor sie die PLG verlässt.',
  },
  {
    path: 'plc.errors.leadCannotBeRemoved',
    expectedDe:
      'Die Leitung kann nicht entfernt werden; übertrage die Leitung oder lösche die PLG.',
  },
  {
    path: 'plc.errors.notAMember',
    expectedDe: 'Diese Person ist kein Mitglied dieser PLG.',
  },
  {
    path: 'plc.errors.cannotDemoteLead',
    expectedDe:
      'Verwende „Leitung übertragen“, um zu ändern, wer die PLG leitet.',
  },
  {
    path: 'plc.errors.invalidRole',
    expectedDe: 'Das ist keine gültige PLG-Rolle.',
  },
  {
    path: 'plc.errors.alreadyLead',
    expectedDe: 'Dieses Mitglied leitet diese PLG bereits.',
  },
  {
    path: 'plc.errors.orgRequired',
    expectedDe: 'PLGs stehen nur Mitgliedern einer Organisation zur Verfügung.',
  },
];

describe('EN locale — affected keys baseline', () => {
  it.each(AFFECTED_KEYS)('en.$path exists', ({ path }) => {
    expect(getLeaf(en, path), `en.${path} is missing`).toBeDefined();
  });
});

describe('DE locale — "PLC" terminology replaced with "PLG" in sidebar.nav.plcs / plc.errors', () => {
  it.each(AFFECTED_KEYS)(
    'de.$path is the PLG-based translation, not the PLC drift',
    ({ path, expectedDe }) => {
      const value = getLeaf(de, path);
      expect(value, `de.${path} is missing`).toBeDefined();
      expect(
        value,
        `de.${path} should be "${expectedDe}" (this namespace's established German term is "PLG", ` +
          `not the untranslated English acronym "PLC") but got "${value}"`
      ).toBe(expectedDe);
    }
  );

  it('has no remaining "PLC"/"PLCs" usages in plc.errors', () => {
    const all: Array<[string, string]> = [];
    collectStrings(
      (de as unknown as { plc: { errors: unknown } }).plc.errors,
      'plc.errors',
      all
    );
    const offenders = all.filter(([, value]) => /\bPLCs?\b/i.test(value));
    expect(
      offenders,
      `Found ${offenders.length} DE plc.errors value(s) using the untranslated acronym "PLC" ` +
        `instead of the established "PLG" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });

  it('sidebar.nav.plcs has no remaining "PLC"/"PLCs" usage', () => {
    const value = getLeaf(de, 'sidebar.nav.plcs') ?? '';
    expect(/\bPLCs?\b/i.test(value)).toBe(false);
  });
});
