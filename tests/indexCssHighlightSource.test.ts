import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { HIGHLIGHT_BG_CLASSES } from '@/utils/writtenAnnotations';

// Tailwind v4 has no config safelist; index.css force-generates these with `@source inline`.
describe('index.css highlight @source inline', () => {
  const css = readFileSync('index.css', 'utf-8');
  const inlined = [...css.matchAll(/@source inline\("([^"]*)"\)/g)].flatMap(
    (m) => m[1].split(/\s+/)
  );

  it.each(HIGHLIGHT_BG_CLASSES)('lists %s', (cls) => {
    expect(inlined).toContain(cls);
  });
});
