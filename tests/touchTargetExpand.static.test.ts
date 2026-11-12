import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// The 44px ::after hit area covers the nearest positioned ancestor unless the class positions its own host.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(repoRoot, 'index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);

const layerBody = (name: string): string => {
  const start = css.search(new RegExp(`@layer\\s+${name}\\s*\\{`));
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0)
      return css.slice(css.indexOf('{', start) + 1, i);
  }
  return '';
};

describe('touch-target-expand', () => {
  it('positions its own element in the components layer', () => {
    // components sits below utilities, so `absolute`/`fixed`/`sticky` on the same element still win.
    expect(layerBody('components')).toMatch(
      /\.touch-target-expand\s*\{[^}]*position:\s*relative/
    );
  });

  it('keeps the ::after hit area absolutely positioned and sized to its host', () => {
    expect(css).toMatch(
      /\.touch-target-expand::after\s*\{[^}]*position:\s*absolute[^}]*width:\s*100%/
    );
  });

  it('is never set back to static', () => {
    expect(css).not.toMatch(
      /\.touch-target-expand(?![\w-]|::)[^{]*\{[^}]*position:\s*static/
    );
  });
});
