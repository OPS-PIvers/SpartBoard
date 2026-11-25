import { describe, expect, it } from 'vitest';
import { dashboardViewChunks, initialScripts } from './checkBundleSize.mjs';

describe('initialScripts', () => {
  it('lists the entry script and modulepreloads, not CSS', () => {
    const html =
      '<script type="module" src="/assets/index-A.js"></script>' +
      '<link rel="modulepreload" href="/assets/react-vendor-B.js">' +
      '<link rel="stylesheet" href="/assets/index-C.css">';
    expect(initialScripts(html)).toEqual([
      'assets/index-A.js',
      'assets/react-vendor-B.js',
    ]);
  });
});

describe('dashboardViewChunks', () => {
  it('returns every DashboardView chunk, not just the first', () => {
    expect(
      dashboardViewChunks([
        'DashboardView-A.js',
        'x.js',
        'DashboardView-B.js',
        'DashboardView-C.css',
      ])
    ).toEqual(['DashboardView-A.js', 'DashboardView-B.js']);
  });
});
