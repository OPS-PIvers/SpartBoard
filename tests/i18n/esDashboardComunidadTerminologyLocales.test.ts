// ES plcDashboard used the untranslated acronym "PLC" in 28 keys instead of the established "Comunidad" term.

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
  {
    path: 'plcDashboard.activity.feedAria',
    expectedEs: 'Actividad reciente de la Comunidad',
  },
  {
    path: 'plcDashboard.activity.event.member_joined',
    expectedEs: '{{actor}} se unió a la Comunidad',
  },
  {
    path: 'plcDashboard.activity.event.member_left',
    expectedEs: '{{actor}} salió de la Comunidad',
  },
  {
    path: 'plcDashboard.sharedData.emptySubtitle',
    expectedEs:
      'Cuando los miembros realicen una evaluación común con el modo Comunidad, aquí aparecerán resultados anonimizados.',
  },
  {
    path: 'plcDashboard.meeting.pick.emptySubtitle',
    expectedEs:
      'Cuando el equipo aplique una evaluación común en modo Comunidad, los resultados anonimizados aparecerán aquí, listos para revisarlos juntos.',
  },
  {
    path: 'plcDashboard.meeting.act.subtitle',
    expectedEs:
      'Crea elementos de acción. Al guardar, cada uno se convierte en una tarea seguida de la Comunidad para su responsable.',
  },
  {
    path: 'plcDashboard.search.ariaLabel',
    expectedEs: 'Buscar en esta Comunidad',
  },
  {
    path: 'plcDashboard.search.placeholder',
    expectedEs: 'Buscar en esta Comunidad…',
  },
  {
    path: 'plcDashboard.viewer.badgeTooltip',
    expectedEs:
      'Tienes acceso de espectador a esta Comunidad. Puedes leer todo, pero crear, editar y eliminar están desactivados.',
  },
  {
    path: 'plcDashboard.resources.managerTitle',
    expectedEs: 'Recursos de la Comunidad',
  },
  {
    path: 'plcDashboard.resources.managerSubtitle',
    expectedEs:
      'Envía recursos curados (documentos, cuestionarios, tableros) a Comunidades específicas o a todas.',
  },
  {
    path: 'plcDashboard.resources.descriptionLabel',
    expectedEs: 'Notas para los miembros de la Comunidad (opcional)',
  },
  {
    path: 'plcDashboard.resources.errorPlcRequired',
    expectedEs:
      'Selecciona al menos una Comunidad al usar «Comunidades seleccionadas».',
  },
  {
    path: 'plcDashboard.resources.confirmDelete',
    expectedEs: '¿Eliminar este recurso? Las Comunidades ya no podrán verlo.',
  },
  {
    path: 'plcDashboard.resources.targetAllBadge',
    expectedEs: 'Todas las Comunidades',
  },
  {
    path: 'plcDashboard.resources.targetSelectedBadge_one',
    expectedEs: '{{count}} Comunidad',
  },
  {
    path: 'plcDashboard.resources.targetSelectedBadge_other',
    expectedEs: '{{count}} Comunidades',
  },
  {
    path: 'plcDashboard.resources.scopeAll',
    expectedEs: 'Todas las Comunidades',
  },
  {
    path: 'plcDashboard.resources.scopeSelected',
    expectedEs: 'Comunidades seleccionadas',
  },
  {
    path: 'plcDashboard.resources.loadingPlcs',
    expectedEs: 'Cargando Comunidades…',
  },
  {
    path: 'plcDashboard.resources.loadPlcsError',
    expectedEs: 'No se pudieron cargar las Comunidades. Inténtalo de nuevo.',
  },
  {
    path: 'plcDashboard.resources.noPlcs',
    expectedEs: 'No hay Comunidades disponibles.',
  },
  {
    path: 'plcDashboard.resources.selectPlcGroup',
    expectedEs: 'Seleccionar Comunidades',
  },
  {
    path: 'plcDashboard.resources.useSuccess',
    expectedEs: '«{{title}}» se añadió a esta Comunidad.',
  },
  {
    path: 'plcDashboard.resources.inboxSubtitle',
    expectedEs:
      'Curado por tu administrador. Haz clic en «Usar» para agregarlo a tu Comunidad.',
  },
  {
    path: 'plcDashboard.resources.usedStatus',
    expectedEs: 'Añadido a tu Comunidad',
  },
  {
    path: 'plcDashboard.resources.openAction',
    expectedEs: 'Abrir {{title}} en esta Comunidad',
  },
  {
    path: 'plcDashboard.resources.useAction',
    expectedEs: 'Usar {{title}} en esta Comunidad',
  },
];

describe('EN locale — affected keys baseline', () => {
  it.each(AFFECTED_KEYS)('en.$path exists', ({ path }) => {
    expect(getLeaf(en, path), `en.${path} is missing`).toBeDefined();
  });
});

describe('ES locale — "PLC" terminology replaced with "Comunidad" in plcDashboard', () => {
  it.each(AFFECTED_KEYS)(
    'es.$path is the Comunidad-based translation, not the PLC drift',
    ({ path, expectedEs }) => {
      const value = getLeaf(es, path);
      expect(value, `es.${path} is missing`).toBeDefined();
      expect(
        value,
        `es.${path} should be "${expectedEs}" (plcDashboard's established Spanish term is ` +
          `"Comunidad", not the untranslated English acronym "PLC") but got "${value}"`
      ).toBe(expectedEs);
    }
  );

  it('has no remaining "PLC"/"PLCs" usages anywhere in plcDashboard', () => {
    const all: Array<[string, string]> = [];
    collectStrings(
      (es as unknown as { plcDashboard: unknown }).plcDashboard,
      'plcDashboard',
      all
    );
    const offenders = all.filter(([, value]) => /\bPLCs?\b/i.test(value));
    expect(
      offenders,
      `Found ${offenders.length} ES plcDashboard value(s) using the untranslated acronym "PLC" ` +
        `instead of the established "Comunidad" translation: ` +
        `${offenders.map(([p, v]) => `${p}="${v}"`).join(', ')}`
    ).toEqual([]);
  });
});
