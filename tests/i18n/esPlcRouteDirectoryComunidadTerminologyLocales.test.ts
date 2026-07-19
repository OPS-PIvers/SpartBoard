// ES `plcRoute.*` and `plcDirectory.*` used the untranslated English acronym "PLC" instead of
// the project's established Spanish term "Comunidad" (see plcDashboard.subtitle: "Panel de la
// Comunidad", sidebar.plcs.title: "Mis Comunidades", and plc.errors.plcNotFound: "Comunidad no
// encontrada." — fixed in esPlcErrorsComunidadTerminologyLocales.test.ts / #2229). These are
// sibling namespaces to plcDashboard/plc.errors/sidebar.plcs (not covered by their scoped
// recursive scans), so they need their own scoped scan to avoid conflicting with legitimately-
// scoped "PLC" usage elsewhere in es.json (e.g. admin.plc.recovery, an admin-only namespace that
// intentionally keeps "PLC").

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
  { path: 'plcRoute.loading', expectedEs: 'Cargando Comunidad…' },
  { path: 'plcRoute.notFoundTitle', expectedEs: 'Comunidad no encontrada' },
  {
    path: 'plcRoute.notFoundBody',
    expectedEs: 'Esta Comunidad no existe o ya no eres miembro de ella.',
  },
  { path: 'plcRoute.hubTitle', expectedEs: 'Mis Comunidades' },
  { path: 'plcRoute.hubEmptyTitle', expectedEs: 'Aún no hay Comunidades' },
  {
    path: 'plcRoute.hubEmptySubtitle',
    expectedEs:
      'Crea una Comunidad desde la barra lateral e invita a tus colegas.',
  },
  {
    path: 'plcDirectory.heading',
    expectedEs: 'Comunidades en mi edificio',
  },
  {
    path: 'plcDirectory.emptyTitle',
    expectedEs: 'No hay otras Comunidades para mostrar',
  },
  {
    path: 'plcDirectory.emptySubtitle',
    expectedEs: 'Ahora mismo no hay otras Comunidades en tu edificio.',
  },
  {
    path: 'plcDirectory.noOrgSubtitle',
    expectedEs:
      'Tu cuenta aún no está vinculada a una escuela, por lo que no podemos mostrar Comunidades cercanas.',
  },
];

describe('EN locale — affected keys baseline', () => {
  it.each(AFFECTED_KEYS)('en.$path exists', ({ path }) => {
    expect(getLeaf(en, path), `en.${path} is missing`).toBeDefined();
  });
});

describe('ES locale — "PLC" terminology replaced with "Comunidad" in plcRoute / plcDirectory', () => {
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

  it('has no remaining "PLC"/"PLCs" usages in plcRoute', () => {
    const all: Array<[string, string]> = [];
    collectStrings(
      (es as unknown as { plcRoute: unknown }).plcRoute,
      'plcRoute',
      all
    );
    const offenders = all.filter(([, value]) => /\bPLCs?\b/i.test(value));
    expect(
      offenders,
      `Found ${offenders.length} ES plcRoute value(s) using the untranslated acronym "PLC" ` +
        `instead of the established "Comunidad" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });

  it('has no remaining "PLC"/"PLCs" usages in plcDirectory', () => {
    const all: Array<[string, string]> = [];
    collectStrings(
      (es as unknown as { plcDirectory: unknown }).plcDirectory,
      'plcDirectory',
      all
    );
    const offenders = all.filter(([, value]) => /\bPLCs?\b/i.test(value));
    expect(
      offenders,
      `Found ${offenders.length} ES plcDirectory value(s) using the untranslated acronym "PLC" ` +
        `instead of the established "Comunidad" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });
});
