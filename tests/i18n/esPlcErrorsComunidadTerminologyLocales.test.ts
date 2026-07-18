// ES locale's `sidebar.nav.plcs` label and `plc.errors.*` namespace used the untranslated
// English acronym "PLC" instead of the project's established Spanish term "Comunidad" (see
// plcDashboard.subtitle: "Panel de la Comunidad", sidebar.plcs.* — e.g. sidebar.plcs.yourPlcs:
// "Tus Comunidades" — and plcDashboard.members.*). This is the ES sibling of the DE PLC->PLG
// drift fixed in dePlcErrorsPlgTerminologyLocales.test.ts (#2193): a separate namespace from
// plcDashboard (covered by esPlcDashboardComunidadLocales.test.ts / #2214), so it needs its own
// scoped recursive scan to avoid conflicting with legitimately-scoped "PLC" usage elsewhere in
// es.json (e.g. admin.plc.recovery, an admin-only namespace that intentionally keeps "PLC").

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import es from '@/locales/es.json';

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

const AFFECTED_KEYS: Array<{ path: string; expectedEs: string }> = [
  { path: 'sidebar.nav.plcs', expectedEs: 'Mis Comunidades' },
  {
    path: 'plc.errors.nameRequired',
    expectedEs: 'Se requiere el nombre de la Comunidad.',
  },
  {
    path: 'plc.errors.accountEmailRequired',
    expectedEs:
      'Se requiere un correo electrónico de cuenta para crear una Comunidad.',
  },
  { path: 'plc.errors.plcNotFound', expectedEs: 'Comunidad no encontrada.' },
  {
    path: 'plc.errors.leadCannotLeave',
    expectedEs:
      'El líder debe transferir el liderazgo antes de abandonar la Comunidad.',
  },
  {
    path: 'plc.errors.leadCannotBeRemoved',
    expectedEs:
      'No se puede eliminar al líder; transfiere el liderazgo o elimina la Comunidad.',
  },
  {
    path: 'plc.errors.notAMember',
    expectedEs: 'Esa persona no es miembro de esta Comunidad.',
  },
  {
    path: 'plc.errors.cannotDemoteLead',
    expectedEs:
      'Usa «Transferir liderazgo» para cambiar quién lidera la Comunidad.',
  },
  {
    path: 'plc.errors.invalidRole',
    expectedEs: 'Ese no es un rol válido de la Comunidad.',
  },
  {
    path: 'plc.errors.alreadyLead',
    expectedEs: 'Ese miembro ya es el líder de esta Comunidad.',
  },
  {
    path: 'plc.errors.orgRequired',
    expectedEs:
      'Las Comunidades solo están disponibles para los miembros de una organización.',
  },
];

describe('EN locale — affected keys baseline', () => {
  it.each(AFFECTED_KEYS)('en.$path exists', ({ path }) => {
    expect(getLeaf(en, path), `en.${path} is missing`).toBeDefined();
  });
});

describe('ES locale — "PLC" terminology replaced with "Comunidad" in sidebar.nav.plcs / plc.errors', () => {
  it.each(AFFECTED_KEYS)(
    'es.$path is the Comunidad-based translation, not the PLC drift',
    ({ path, expectedEs }) => {
      const value = getLeaf(es, path);
      expect(value, `es.${path} is missing`).toBeDefined();
      expect(
        value,
        `es.${path} should be "${expectedEs}" (this namespace's established Spanish term is ` +
          `"Comunidad", not the untranslated English acronym "PLC") but got "${value}"`
      ).toBe(expectedEs);
    }
  );

  it('has no remaining "PLC"/"PLCs" usages in plc.errors', () => {
    const all: Array<[string, string]> = [];
    collectStrings(
      (es as unknown as { plc: { errors: unknown } }).plc.errors,
      'plc.errors',
      all
    );
    const offenders = all.filter(([, value]) => /\bPLCs?\b/i.test(value));
    expect(
      offenders,
      `Found ${offenders.length} ES plc.errors value(s) using the untranslated acronym "PLC" ` +
        `instead of the established "Comunidad" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });

  it('sidebar.nav.plcs has no remaining "PLC"/"PLCs" usage', () => {
    const value = getLeaf(es, 'sidebar.nav.plcs') ?? '';
    expect(/\bPLCs?\b/i.test(value)).toBe(false);
  });
});
