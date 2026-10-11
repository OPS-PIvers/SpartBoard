import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, it, expect } from 'vitest';
import tailwindConfig from '@/tailwind.config.js';

// Classroom touch panels have no hover: hover styles must not stick after a tap, and hover-revealed controls need a touch fallback.
const repoRoot = resolve(__dirname, '../..');
const HOVER_MEDIA = '@media (hover: hover) and (pointer: fine)';
const TOUCH_MEDIA = '@media (hover: none), (pointer: coarse)';

const compile = async (classes: string) => {
  const result = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: [{ raw: `<div class="${classes}"></div>`, extension: 'html' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css;
};

const mediaOf = (css: string, selectorFragment: string) => {
  const root = postcss.parse(css);
  let media: string | undefined;
  root.walkRules((rule) => {
    if (rule.selector.includes(selectorFragment)) {
      const parent = rule.parent;
      media =
        parent?.type === 'atrule'
          ? `@media ${(parent as postcss.AtRule).params}`
          : 'none';
    }
  });
  return media;
};

const SCAN_ROOTS = [
  'components/widgets',
  'components/layout',
  'components/common',
];
const HIDDEN_AT_REST = /(^|[\s'"`])opacity-0(?=[\s'"`]|$)/;
const HOVER_REVEAL = /hover(\/[\w-]+)?:opacity-100/;
// Hover-only by design: tooltips, hover hints, and overlays whose tap already does the job.
const HOVER_ONLY = [
  {
    file: 'components/layout/dock/QuickAccessButton.tsx',
    snippet: 'bg-slate-800 text-white',
  },
  { file: 'components/layout/dock/ToolDockItem.tsx', snippet: '<RefreshCcw' },
  {
    file: 'components/widgets/NumberLine/Widget.tsx',
    snippet: 'pointer-events-none',
  },
  { file: 'components/widgets/MusicWidget/Widget.tsx', snippet: 'bg-black/0' },
  {
    file: 'components/widgets/MathToolInstance/RotationHandle.tsx',
    snippet: "isActive ? 'opacity-100'",
  },
  { file: 'components/common/DraggableWindow.tsx', snippet: '<Pencil' },
  {
    file: 'components/common/library/FolderTree.tsx',
    snippet: 'group-focus-within:opacity-100',
  },
];

const listFiles = (path: string): string[] =>
  readdirSync(join(repoRoot, path)).flatMap((name) => {
    const child = join(path, name);
    if (statSync(join(repoRoot, child)).isDirectory()) return listFiles(child);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [child] : [];
  });

describe('touch panel hover handling', () => {
  it('only applies hover styles on devices that can hover', async () => {
    const css = await compile('hover:bg-red-500 group-hover:opacity-100');
    expect(mediaOf(css, 'hover\\:bg-red-500')).toBe(HOVER_MEDIA);
    expect(mediaOf(css, 'group-hover\\:opacity-100')).toBe(HOVER_MEDIA);
  });

  it('provides a touch: variant for touch-first devices', async () => {
    const css = await compile('touch:opacity-100');
    expect(mediaOf(css, 'touch\\:opacity-100')).toBe(TOUCH_MEDIA);
  });

  it('gives every hover-revealed board control a touch fallback', () => {
    const missing = SCAN_ROOTS.flatMap(listFiles).flatMap((file) =>
      readFileSync(join(repoRoot, file), 'utf8')
        .split('\n')
        .map((line, i) => ({ file, line, at: `${file}:${i + 1}` }))
        .filter(
          ({ line }) =>
            HIDDEN_AT_REST.test(line) &&
            HOVER_REVEAL.test(line) &&
            !line.includes('touch:opacity-100') &&
            !HOVER_ONLY.some((h) => h.file === file && line.includes(h.snippet))
        )
        .map(({ at }) => at)
    );
    expect(missing).toEqual([]);
  });
});
