import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import * as source from '@/config/backgrounds';
import * as copy from '@/functions/src/mcp/boardBackgrounds.gen';
import { WIDGET_CONFIG_MIGRATIONS } from '@/utils/migration';

const SOURCE = resolve(process.cwd(), 'config/backgrounds.ts');
const FILE = resolve(
  process.cwd(),
  'functions/src/mcp/boardBackgrounds.gen.ts'
);

const generated = () =>
  [
    '// Generated from config/backgrounds.ts by tests/mcpBoardBackgroundsCopy.test.ts; rerun it with UPDATE_BOARD_BACKGROUNDS_COPY=1.',
    readFileSync(SOURCE, 'utf8'),
  ].join('\n');

describe('connector board backgrounds copy', () => {
  it('matches config/backgrounds.ts (UPDATE_BOARD_BACKGROUNDS_COPY=1 rewrites it)', async () => {
    const text = generated();
    if (process.env.UPDATE_BOARD_BACKGROUNDS_COPY) {
      await writeGenerated(FILE, text);
      return;
    }
    const config = await resolveConfig(FILE);
    const expected = await format(text, { ...config, filepath: FILE });
    expect(readFileSync(FILE, 'utf8')).toBe(expected);
  });

  it('has no imports, so functions/ can compile it on its own', () => {
    expect(readFileSync(FILE, 'utf8')).not.toMatch(/^import /m);
    expect(copy.BACKGROUND_COLORS).toEqual(source.BACKGROUND_COLORS);
    expect(copy.DEFAULT_BOARD_BACKGROUND).toBe(source.DEFAULT_BOARD_BACKGROUND);
  });

  // The server stamps configVersion 0 on widgets it writes (functions/src/mcp/boardWrite.ts).
  it('has no widget config migrations the server would need to stamp', () => {
    expect(WIDGET_CONFIG_MIGRATIONS).toEqual({});
  });
});
