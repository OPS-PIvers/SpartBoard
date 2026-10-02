import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_ANCHORS, type TourAnchorDef } from '@/config/tourAnchors';
import { TOUR_ANCHOR_LIST } from '@/functions/src/mcp/tourAnchorList';
import { WIDGET_TYPE_LIST } from '@/functions/src/mcp/widgetTypeList';
import { TOOLS } from '@/config/tools';

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
      ...(def.requires ? { requires: def.requires } : {}),
    })
  );
}

describe('connector tour anchor list', () => {
  it('matches config/tourAnchors.ts (UPDATE_TOUR_ANCHOR_LIST=1 rewrites it)', () => {
    const list = expected();
    if (process.env.UPDATE_TOUR_ANCHOR_LIST) {
      writeFileSync(
        FILE,
        `// Generated from config/tourAnchors.ts by tests/mcpTourAnchorList.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.\nexport const TOUR_ANCHOR_LIST: ReadonlyArray<{\n  id: string;\n  label: string;\n  scope: 'board' | 'widget' | 'widget type' | 'field';\n  panel?: true;\n  destructive?: true;\n  requires?: string;\n}> = ${JSON.stringify(list, null, 2)};\n`
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
