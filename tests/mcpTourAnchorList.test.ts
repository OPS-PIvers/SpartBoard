import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_ANCHORS, type TourAnchorDef } from '@/config/tourAnchors';
import { TOUR_ANCHOR_LIST } from '@/functions/src/mcp/tourAnchorList';
import { TOUR_SURFACES } from '@/config/tourSurfaces';
import { TOUR_ANCHOR_SURFACES } from '@/config/tourAnchorSurfaces.generated';
import { surfacePath } from '@/config/tourAnchorRoutes';
import { WIDGET_TYPE_LIST } from '@/functions/src/mcp/widgetTypeList';
import { TOOLS } from '@/config/tools';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';
import { SETTINGS_FIELD_LIST } from '@/functions/src/mcp/settingsFieldList';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';

const FILE = resolve(process.cwd(), 'functions/src/mcp/tourAnchorList.ts');

function expected() {
  return Object.entries(TOUR_ANCHORS as Record<string, TourAnchorDef>).map(
    ([id, def]) => ({
      id,
      label: def.label,
      scope: def.perField
        ? 'field'
        : def.perWidgetType
          ? 'widget type'
          : def.perWidget
            ? 'widget'
            : 'board',
      ...(def.panel ? { panel: true } : {}),
      ...(def.destructive ? { destructive: true } : {}),
      ...(def.persists ? { persists: true } : {}),
      ...(def.requires ? { requires: def.requires } : {}),
      ...routesOf(id),
    })
  );
}

// Where the anchor renders and the clicks from the board that reveal it; no path means the way in is not mapped yet.
function routesOf(id: string) {
  const routes = (TOUR_ANCHOR_SURFACES[id] ?? []).map((surface) => {
    const def = TOUR_SURFACES[surface];
    const reach = surfacePath(surface);
    const inner = def.inner?.[id];
    return {
      surface,
      kind: def.kind,
      ...(def.widgetType ? { widget_type: def.widgetType } : {}),
      ...(def.url ? { url: def.url } : {}),
      ...(reach ? { path: inner ? [...reach.path, inner] : reach.path } : {}),
      ...(reach?.needs.length ? { needs: reach.needs } : {}),
    };
  });
  return routes.length ? { routes } : {};
}

describe('connector tour anchor list', () => {
  it('matches config/tourAnchors.ts (UPDATE_TOUR_ANCHOR_LIST=1 rewrites it)', () => {
    const list = expected();
    if (process.env.UPDATE_TOUR_ANCHOR_LIST) {
      writeFileSync(
        FILE,
        // Parsed JSON, because an array literal this varied is too complex for the type checker to infer.
        `// Generated from config/tourAnchors.ts by tests/mcpTourAnchorList.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.\nexport interface TourAnchorEntry {\n  id: string;\n  label: string;\n  scope: 'board' | 'widget' | 'widget type' | 'field';\n  panel?: true;\n  destructive?: true;\n  persists?: true;\n  requires?: string;\n  routes?: ReadonlyArray<{\n    surface: string;\n    kind: string;\n    widget_type?: string;\n    url?: string;\n    path?: readonly string[];\n    needs?: readonly string[];\n  }>;\n}\n\nexport const TOUR_ANCHOR_LIST = JSON.parse(String.raw\`${JSON.stringify(list, null, 2)}\`) as readonly TourAnchorEntry[];\n`
      );
      return;
    }
    expect(TOUR_ANCHOR_LIST).toEqual(list);
  });
});

const TYPES_FILE = resolve(
  process.cwd(),
  'functions/src/mcp/widgetTypeList.ts'
);
const INTERNAL_TOOLS = new Set(['record', 'magic', 'remote']);

describe('connector widget type list', () => {
  it('matches config/tools.ts (UPDATE_TOUR_ANCHOR_LIST=1 rewrites it)', () => {
    const types = TOOLS.map((t) => String(t.type)).filter(
      (t) => !INTERNAL_TOOLS.has(t)
    );
    if (process.env.UPDATE_TOUR_ANCHOR_LIST) {
      writeFileSync(
        TYPES_FILE,
        `// Generated from config/tools.ts by tests/mcpTourAnchorList.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.\nexport const WIDGET_TYPE_LIST: readonly string[] = ${JSON.stringify(types, null, 2)};\n`
      );
      return;
    }
    expect(WIDGET_TYPE_LIST).toEqual(types);
  });
});

const FIELDS_FILE = resolve(
  process.cwd(),
  'functions/src/mcp/settingsFieldList.ts'
);

const EN = JSON.parse(
  readFileSync(resolve(process.cwd(), 'locales/en.json'), 'utf8')
) as Record<string, unknown>;

const lookup = (path: string): string | undefined => {
  const hit = path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      EN
    );
  return typeof hit === 'string' ? hit : undefined;
};

// Mirrors resolveLabel: the widget's own leaf, then the common one.
const englishLabel = (type: string, leaf: string) =>
  lookup(`widgetSettings.${type}.${leaf}`) ??
  lookup(`widgetSettings.common.${leaf}`) ??
  leaf;

// Mirrors SchemaRenderer, FieldRenderer and ToggleField's tourFieldAttr calls.
function fieldAnchors(type: string, schema: WidgetSettingsSchema) {
  const out = new Map<string, string>();
  const add = (anchor: string, label: string) => {
    if (!out.has(anchor)) out.set(anchor, label);
  };
  const addField = (field: Field) => {
    const label = englishLabel(type, field.label);
    const id = field.type === 'toggle' ? 'settings.toggle' : 'settings.field';
    add(`${id}:${type}#${field.key}`, label);
    if (field.type === 'partnerWidget') addField(field.control);
  };
  for (const group of schema.groups) {
    add(
      `settings.group:${type}#${group.id}`,
      englishLabel(type, group.title ?? `group.${group.id}`)
    );
    group.fields.forEach((field) => addField(field));
  }
  return [...out].map(([anchor, label]) => ({ anchor, label }));
}

describe('connector settings field list', () => {
  it('matches the settings schemas (UPDATE_TOUR_ANCHOR_LIST=1 rewrites it)', async () => {
    const list: Record<string, Array<{ anchor: string; label: string }>> = {};
    for (const [type, load] of Object.entries(WIDGET_SETTINGS_SCHEMAS)) {
      if (!load) continue;
      list[type] = fieldAnchors(type, await load());
    }
    if (process.env.UPDATE_TOUR_ANCHOR_LIST) {
      writeFileSync(
        FIELDS_FILE,
        `// Generated from the widget settings schemas by tests/mcpTourAnchorList.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.\nexport const SETTINGS_FIELD_LIST: Readonly<\n  Record<string, ReadonlyArray<{ anchor: string; label: string }>>\n> = ${JSON.stringify(list, null, 2)};\n`
      );
      return;
    }
    expect(SETTINGS_FIELD_LIST).toEqual(list);
  });
});
