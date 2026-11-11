import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import { buildPreviewHtml, genModule } from '@/scripts/build-mcp-apps.mjs';

const FILE = resolve(process.cwd(), 'functions/src/mcp/apps/previewApp.gen.ts');

describe('MCP Apps preview bundle', () => {
  it('matches mcpApps/preview; rebuild with node scripts/build-mcp-apps.mjs', async () => {
    const next = await genModule(await buildPreviewHtml());
    if (process.env.UPDATE_MCP_APPS === '1') await writeGenerated(FILE, next);
    expect(readFileSync(FILE, 'utf8')).toBe(next);
  }, 120_000);
});
