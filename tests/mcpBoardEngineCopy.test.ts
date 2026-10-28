import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import { BOARD_TEMPLATES } from '@/config/boardTemplates';
import { applyTemplate, analyze, tidy } from '@/utils/boardLayout';
import * as copy from '@/functions/src/mcp/boardEngine.gen';

// Order matters: each file only uses names from the files before it.
const SOURCES = [
  'config/snapZones.ts',
  'config/boardTemplates.ts',
  'utils/boardLayout/geometry.ts',
  'utils/boardLayout/apply.ts',
  'utils/boardLayout/analyze.ts',
  'utils/boardLayout/tidy.ts',
];

const FILE = resolve(process.cwd(), 'functions/src/mcp/boardEngine.gen.ts');

const generated = () =>
  [
    '// Generated from config/snapZones.ts, config/boardTemplates.ts and utils/boardLayout/ by tests/mcpBoardEngineCopy.test.ts; rerun it with UPDATE_BOARD_ENGINE_COPY=1.',
    'type WidgetType = string;',
    ...SOURCES.map((path) =>
      readFileSync(resolve(process.cwd(), path), 'utf8').replace(
        /^import[\s\S]*?;\n/gm,
        (chunk) => {
          // Only whole static imports may be stripped; anything else would silently eat code.
          if (!/^import [^;]* from '[^']+';\n$/.test(chunk))
            throw new Error(`Unexpected import in ${path}: ${chunk}`);
          return '';
        }
      )
    ),
  ].join('\n');

describe('connector board engine copy', () => {
  it('matches the engine sources (UPDATE_BOARD_ENGINE_COPY=1 rewrites it)', async () => {
    const text = generated();
    if (process.env.UPDATE_BOARD_ENGINE_COPY) {
      await writeGenerated(FILE, text);
      return;
    }
    const config = await resolveConfig(FILE);
    const expected = await format(text, { ...config, filepath: FILE });
    expect(readFileSync(FILE, 'utf8')).toBe(expected);
  });

  it('has no imports, so functions/ can compile it on its own', () => {
    expect(readFileSync(FILE, 'utf8')).not.toMatch(/^import /m);
  });

  it('places, analyses and tidies exactly like the app engine', () => {
    const screen = { w: 1366, h: 768 };
    for (const template of BOARD_TEMPLATES) {
      const fills = template.slots.map((slot) => ({ zoneId: slot.zoneId }));
      const copyTemplate = copy.BOARD_TEMPLATES.find(
        (t) => t.id === template.id
      );
      expect(copyTemplate).toEqual(template);
      if (!copyTemplate) continue;
      expect(copy.applyTemplate(copyTemplate, fills, screen)).toEqual(
        applyTemplate(template, fills, screen)
      );
    }
    const widgets = [
      { id: 'a', xProp: 0.1, yProp: 0.1, wProp: 0.5, hProp: 0.4 },
      { id: 'b', xProp: 0.4, yProp: 0.3, wProp: 0.5, hProp: 0.6 },
    ];
    expect(copy.analyze(widgets, screen)).toEqual(analyze(widgets, screen));
    expect(copy.tidy(widgets, screen)).toEqual(tidy(widgets, screen));
  });
});
