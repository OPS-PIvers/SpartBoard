// Guards FR plcDashboard against drifting from the established "CAP" term back to raw "PLC".

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

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

const AFFECTED_KEYS: Array<{ path: string; expectedFr: string }> = [
  {
    path: 'plcDashboard.activity.feedAria',
    expectedFr: 'Activité récente de la CAP',
  },
  {
    path: 'plcDashboard.activity.event.member_joined',
    expectedFr: '{{actor}} a rejoint la CAP',
  },
  {
    path: 'plcDashboard.activity.event.member_left',
    expectedFr: '{{actor}} a quitté la CAP',
  },
  {
    path: 'plcDashboard.sharedData.emptySubtitle',
    expectedFr:
      'Lorsque des membres réalisent une évaluation commune en mode CAP, des résultats anonymisés apparaissent ici.',
  },
  {
    path: 'plcDashboard.meeting.pick.emptySubtitle',
    expectedFr:
      'Lorsque l’équipe fait passer une évaluation commune en mode CAP, les résultats anonymisés apparaissent ici, prêts à être examinés ensemble.',
  },
  {
    path: 'plcDashboard.meeting.act.subtitle',
    expectedFr:
      'Créez des actions. À l’enregistrement, chacune devient une tâche CAP suivie pour la personne responsable.',
  },
  {
    path: 'plcDashboard.viewer.badgeTooltip',
    expectedFr:
      'Vous avez un accès observateur à cette CAP. Vous pouvez tout lire, mais la création, la modification et la suppression sont désactivées.',
  },
];

describe('EN locale — affected keys baseline', () => {
  it.each(AFFECTED_KEYS)('en.$path exists', ({ path }) => {
    expect(getLeaf(en, path), `en.${path} is missing`).toBeDefined();
  });
});

describe('FR locale — "PLC" terminology replaced with "CAP" in plcDashboard', () => {
  it.each(AFFECTED_KEYS)(
    'fr.$path is the CAP-based translation, not the PLC drift',
    ({ path, expectedFr }) => {
      const value = getLeaf(fr, path);
      expect(value, `fr.${path} is missing`).toBeDefined();
      expect(
        value,
        `fr.${path} should be "${expectedFr}" (plcDashboard's established French term is "CAP", ` +
          `not the untranslated English acronym "PLC") but got "${value}"`
      ).toBe(expectedFr);
    }
  );

  it('has no remaining "PLC"/"PLCs" usages anywhere in plcDashboard', () => {
    const all: Array<[string, string]> = [];
    collectStrings(
      (fr as unknown as { plcDashboard: unknown }).plcDashboard,
      'plcDashboard',
      all
    );
    const offenders = all.filter(([, value]) => /\bPLCs?\b/i.test(value));
    expect(
      offenders,
      `Found ${offenders.length} FR plcDashboard value(s) using the untranslated acronym "PLC" ` +
        `instead of the established "CAP" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });
});
