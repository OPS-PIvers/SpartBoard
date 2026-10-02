import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_ANCHORS, type TourAnchorDef } from '@/config/tourAnchors';
import { TOUR_ANCHOR_LIST } from '@/functions/src/mcp/tourAnchorList';

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
