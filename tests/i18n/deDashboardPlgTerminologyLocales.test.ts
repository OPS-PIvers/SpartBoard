// DE locale's plcDashboard namespace used the untranslated English acronym "PLC" in 25 keys
// (mostly the plcDashboard.resources namespace added in a prior fix) instead of the project's
// established "PLG" term (see plcDashboard.subtitle: "PLG-Dashboard", plcDashboard.members.*,
// sidebar.plcs.*, plcDirectory.*) — also guards against future re-introduction.

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
  {
    path: 'plcDashboard.activity.feedAria',
    expectedDe: 'Letzte PLG-Aktivität',
  },
  {
    path: 'plcDashboard.activity.event.member_joined',
    expectedDe: '{{actor}} ist der PLG beigetreten',
  },
  {
    path: 'plcDashboard.activity.event.member_left',
    expectedDe: '{{actor}} hat die PLG verlassen',
  },
  {
    path: 'plcDashboard.sharedData.emptySubtitle',
    expectedDe:
      'Wenn Mitglieder eine gemeinsame Bewertung im PLG-Modus durchführen, erscheinen hier anonymisierte Ergebnisse.',
  },
  {
    path: 'plcDashboard.meeting.pick.emptySubtitle',
    expectedDe:
      'Wenn das Team eine gemeinsame Bewertung im PLG-Modus durchführt, erscheinen hier die anonymisierten Ergebnisse zur gemeinsamen Durchsicht.',
  },
  {
    path: 'plcDashboard.meeting.act.subtitle',
    expectedDe:
      'Lege Aufgaben an. Beim Speichern wird jede zu einer nachverfolgten PLG-Aufgabe für die zuständige Person.',
  },
  { path: 'plcDashboard.resources.managerTitle', expectedDe: 'PLG-Ressourcen' },
  {
    path: 'plcDashboard.resources.managerSubtitle',
    expectedDe:
      'Kuratierte Ressourcen (Dokumente, Quizze, Tafeln) an bestimmte oder alle PLGs senden.',
  },
  {
    path: 'plcDashboard.resources.descriptionLabel',
    expectedDe: 'Notizen für PLG-Mitglieder (optional)',
  },
  {
    path: 'plcDashboard.resources.errorPlcRequired',
    expectedDe:
      'Wähle mindestens eine PLG aus, wenn du „Ausgewählte PLGs“ verwendest.',
  },
  {
    path: 'plcDashboard.resources.confirmDelete',
    expectedDe: 'Diese Ressource löschen? PLGs sehen sie danach nicht mehr.',
  },
  { path: 'plcDashboard.resources.targetAllBadge', expectedDe: 'Alle PLGs' },
  {
    path: 'plcDashboard.resources.targetSelectedBadge_one',
    expectedDe: '{{count}} PLG',
  },
  {
    path: 'plcDashboard.resources.targetSelectedBadge_other',
    expectedDe: '{{count}} PLGs',
  },
  { path: 'plcDashboard.resources.scopeAll', expectedDe: 'Alle PLGs' },
  {
    path: 'plcDashboard.resources.scopeSelected',
    expectedDe: 'Ausgewählte PLGs',
  },
  {
    path: 'plcDashboard.resources.loadingPlcs',
    expectedDe: 'PLGs werden geladen…',
  },
  {
    path: 'plcDashboard.resources.loadPlcsError',
    expectedDe: 'PLGs konnten nicht geladen werden. Bitte versuche es erneut.',
  },
  {
    path: 'plcDashboard.resources.noPlcs',
    expectedDe: 'Keine PLGs verfügbar.',
  },
  {
    path: 'plcDashboard.resources.selectPlcGroup',
    expectedDe: 'PLGs auswählen',
  },
  {
    path: 'plcDashboard.resources.useSuccess',
    expectedDe: '„{{title}}“ wurde zu dieser PLG hinzugefügt.',
  },
  {
    path: 'plcDashboard.resources.inboxSubtitle',
    expectedDe:
      'Von deinem Admin kuratiert. Klicke auf „Verwenden“, um sie zu deiner PLG hinzuzufügen.',
  },
  {
    path: 'plcDashboard.resources.usedStatus',
    expectedDe: 'Zu deiner PLG hinzugefügt',
  },
  {
    path: 'plcDashboard.resources.openAction',
    expectedDe: '{{title}} in dieser PLG öffnen',
  },
  {
    path: 'plcDashboard.resources.useAction',
    expectedDe: '{{title}} in dieser PLG verwenden',
  },
];

describe('EN locale — affected keys baseline', () => {
  it.each(AFFECTED_KEYS)('en.$path exists', ({ path }) => {
    expect(getLeaf(en, path), `en.${path} is missing`).toBeDefined();
  });
});

describe('DE locale — "PLC" terminology replaced with "PLG" in plcDashboard', () => {
  it.each(AFFECTED_KEYS)(
    'de.$path is the PLG-based translation, not the PLC drift',
    ({ path, expectedDe }) => {
      const value = getLeaf(de, path);
      expect(value, `de.${path} is missing`).toBeDefined();
      expect(
        value,
        `de.${path} should be "${expectedDe}" (plcDashboard's established German term is "PLG", ` +
          `not the untranslated English acronym "PLC") but got "${value}"`
      ).toBe(expectedDe);
    }
  );

  it('has no remaining "PLC"/"PLCs" usages anywhere in plcDashboard', () => {
    const all: Array<[string, string]> = [];
    collectStrings(
      (de as unknown as { plcDashboard: unknown }).plcDashboard,
      'plcDashboard',
      all
    );
    const offenders = all.filter(([, value]) => /\bPLCs?\b/.test(value));
    expect(
      offenders,
      `Found ${offenders.length} DE plcDashboard value(s) using the untranslated acronym "PLC" ` +
        `instead of the established "PLG" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });
});
