import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Z_INDEX, type ZIndexLayer } from '@/config/zIndex';

// The widget toolbar is portalled to <body>, so it competes with every full-screen overlay.
const BELOW_TOOLBAR: ZIndexLayer[] = [
  'base',
  'decorator',
  'content',
  'controls',
  'itemDragging',
  'stickerControl',
  'widgetResize',
  'widgetInternalOverlay',
  'widgetControl',
  'dropdown',
  'widget',
  'widgetDrag',
  'dock',
  'dockDragging',
  'sidebar',
  'header',
  'backdrop',
  'overlay',
  'confirmOverlay',
  'annotationSurface',
  'annotationChromeLift',
  'annotationChrome',
  'shareChip',
  'drawer',
];

// Full-screen surfaces that sit under the toolbar on purpose.
const ALLOWED_LOW_OVERLAYS = new Set([
  'components/layout/DashboardView.tsx:backdrop', // spotlight dim; the spotlit widget keeps its toolbar
  'components/layout/AnnotationOverlay.tsx:annotationChrome', // pointer-events-none annotation chrome
  'components/connections/WidgetConnectionControls.tsx:toolMenu', // click-catcher for its own menu
  'components/common/library/FolderPickerPopover.tsx:100', // dialog variant renders inline, not portalled
  'components/flashcards/CheckTabWarning.tsx:overlay', // student app, no widgets
  'components/student/StudentApp.tsx:overlay', // student app, no widgets
  'components/widgets/QuizWidget/components/FreeResponseGrader.tsx:overlay', // inside the widget window
]);

const toCamel = (s: string): string =>
  s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p);
  }
  return out;
};

describe('widget toolbar stacking', () => {
  it('sits above board chrome', () => {
    for (const key of BELOW_TOOLBAR) {
      expect(Z_INDEX[key], key).toBeLessThan(Z_INDEX.toolMenu);
    }
    expect(Z_INDEX.backdrop + 1).toBeLessThan(Z_INDEX.toolMenu);
  });

  it('sits below every other layer, so overlays and their menus cover it', () => {
    const below = new Set<string>([...BELOW_TOOLBAR, 'toolMenu']);
    for (const key of Object.keys(Z_INDEX) as ZIndexLayer[]) {
      if (below.has(key)) continue;
      expect(
        Z_INDEX[key],
        `${key}: add it to BELOW_TOOLBAR or raise it`
      ).toBeGreaterThan(Z_INDEX.toolMenu);
    }
  });

  it('every full-screen fixed surface uses a layer above the toolbar', () => {
    const root = process.cwd();
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const file of walk(join(root, 'components'))) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(root, file).replaceAll('\\', '/');
      let i = src.indexOf('fixed inset-0');
      while (i !== -1) {
        const win = src.slice(i, i + 500);
        const cls = /\bz-(\d+|[a-z][a-z-]*)\b/.exec(win.split('\n')[0]);
        const inline = /Z_INDEX\.(\w+)/.exec(win);
        const key = cls ? toCamel(cls[1]) : inline?.[1];
        const value =
          key && /^\d+$/.test(key)
            ? src.includes('createPortal')
              ? Number(key)
              : undefined // a numeric z on an inline surface stays inside its parent's stacking context
            : key && key in Z_INDEX
              ? Z_INDEX[key as ZIndexLayer]
              : undefined;
        if (key && value !== undefined) {
          seen.add(`${rel}:${key}`);
          if (
            value <= Z_INDEX.toolMenu &&
            !ALLOWED_LOW_OVERLAYS.has(`${rel}:${key}`)
          ) {
            offenders.push(`${rel}:${key}`);
          }
        }
        i = src.indexOf('fixed inset-0', i + 1);
      }
    }
    expect(offenders).toEqual([]);
    expect([...ALLOWED_LOW_OVERLAYS].filter((k) => !seen.has(k))).toEqual([]);
  });
});
