import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import { TOOLS, WIDGET_CATEGORIES } from '@/config/tools';
import { WIDGET_TYPE_LIST } from '@/functions/src/mcp/widgetTypeList';
import { WIDGET_CATALOGUE } from '@/functions/src/mcp/widgetCatalogue.gen';

const FILE = resolve(process.cwd(), 'functions/src/mcp/widgetCatalogue.gen.ts');

const categoryLabel = (value: string | undefined) =>
  WIDGET_CATEGORIES.find((c) => c.value === value)?.label ?? null;

function expected() {
  const rows: Record<string, { name: string; category: string | null }> = {};
  for (const type of WIDGET_TYPE_LIST) {
    const tool = TOOLS.find((t) => t.type === type);
    if (tool)
      rows[type] = { name: tool.label, category: categoryLabel(tool.category) };
  }
  return rows;
}

const generated = () =>
  [
    '// Generated from config/tools.ts by tests/mcpWidgetCatalogue.test.ts; rerun it with UPDATE_WIDGET_CATALOGUE=1.',
    'export const WIDGET_CATALOGUE: Readonly<',
    '  Record<string, { name: string; category: string | null }>',
    `> = ${JSON.stringify(expected(), null, 2)};`,
    '',
  ].join('\n');

describe('connector widget catalogue copy', () => {
  it('matches config/tools.ts (UPDATE_WIDGET_CATALOGUE=1 rewrites it)', async () => {
    const text = generated();
    if (process.env.UPDATE_WIDGET_CATALOGUE) {
      await writeGenerated(FILE, text);
      return;
    }
    const config = await resolveConfig(FILE);
    expect(readFileSync(FILE, 'utf8')).toBe(
      await format(text, { ...config, filepath: FILE })
    );
  });

  it('names every widget teachers can add', () => {
    for (const type of WIDGET_TYPE_LIST)
      expect(WIDGET_CATALOGUE[type]?.name, type).toBeTruthy();
  });
});
