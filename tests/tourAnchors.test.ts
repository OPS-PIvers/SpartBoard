import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  TOUR_ANCHOR_PREREQUISITES,
  TOUR_ANCHORS,
  type TourAnchorDef,
} from '@/config/tourAnchors';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['components', 'context', 'App.tsx'];
const SOURCE_EXT = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

interface SourceFile {
  path: string;
  text: string;
}

// Every anchor use in source: tourAttr('id'…, tourTypeAttr('id'…, tourFieldAttr('id'…, or a data-tour="id" literal.
const ANCHOR_USE =
  /(?:\btourAttr\(\s*|\btourTypeAttr\(\s*|\btourFieldAttr\(\s*|\bdata-tour=\{?\s*|\b\w*[tT]ourId\s*=\s*\{?\s*)(['"`])([^'"`]+)\1/g;

const findAnchorProblems = (
  registry: readonly string[],
  files: readonly SourceFile[]
) => {
  const used = new Map<string, string[]>();
  for (const file of files) {
    for (const match of file.text.matchAll(ANCHOR_USE)) {
      const id = match[2];
      used.set(id, [...(used.get(id) ?? []), file.path]);
    }
  }
  const known = new Set(registry);
  return {
    missing: registry.filter((id) => !used.has(id)),
    unregistered: [...used.entries()]
      .filter(([id]) => !known.has(id))
      .map(([id, paths]) => `${id} (${[...new Set(paths)].join(', ')})`),
  };
};

const collectSources = (): SourceFile[] => {
  const out: SourceFile[] = [];
  const walk = (abs: string) => {
    if (statSync(abs).isDirectory()) {
      for (const entry of readdirSync(abs)) walk(join(abs, entry));
      return;
    }
    if (!SOURCE_EXT.test(abs) || TEST_FILE.test(abs)) return;
    out.push({
      path: relative(repoRoot, abs),
      text: readFileSync(abs, 'utf8'),
    });
  };
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root));
  return out;
};

describe('tour anchor registry', () => {
  const registry = Object.keys(TOUR_ANCHORS);

  it('renders every registered anchor somewhere in the app source', () => {
    const { missing } = findAnchorProblems(registry, collectSources());
    expect(
      missing,
      `Registered in config/tourAnchors.ts but no longer rendered: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('uses no data-tour id that is missing from the registry', () => {
    const { unregistered } = findAnchorProblems(registry, collectSources());
    expect(
      unregistered,
      `Add these to config/tourAnchors.ts or remove them: ${unregistered.join('; ')}`
    ).toEqual([]);
  });

  it('gives every anchor a label and at most one scope', () => {
    for (const [id, def] of Object.entries(TOUR_ANCHORS)) {
      expect(def.label.trim(), id).not.toBe('');
      const scopes = ['perWidget', 'perWidgetType', 'perField'].filter(
        (k) => k in def
      );
      expect(scopes.length, id).toBeLessThanOrEqual(1);
    }
  });

  it('flags assign, share, publish and delete anchors as persists or destructive', () => {
    const OPENS_ONLY = new Set([
      'sidebar.assignments',
      'boards.share-board',
      'boards.sub-share-copy-link',
      'share-link.share-with-sub',
      'sub-share.building',
      'sub-share.email-input',
      'sub-share.add-email',
      'sub-share.done',
      'quiz-settings.assignment-archive',
      'activity-wall-editor.allow-delete',
      'assign-stepper.cancel',
      'boards-modal.collection-share',
      'share-link.mode-synced',
      'share-link.mode-view-only',
      'share-link.mode-copy',
      'share-link.mode-substitute',
      'share-link.close',
      'share-link.url',
      'share-link.copy',
      'share-link.done',
      'share-link.sub-expires',
      'share-link.sub-building',
      'share-link.sub-preset-email',
      'share-link.sub-remove-email',
      'share-link.sub-email-input',
      'share-link.add-sub-email',
      'share-link.plc-scope',
      'sub-share.expires',
      'sub-share.email-chip',
      'sub-share.remove-email',
      'sub-share.cancel',
      'sub-share.url',
      'sub-share.copy-link',
      'share-collection.share-with-sub',
      'share-collection.mode-copy',
      'share-collection.mode-substitute',
      'share-collection.ttl',
      'share-collection.building',
      'share-collection.preset-email',
      'share-collection.remove-email',
      'share-collection.email-input',
      'share-collection.add-email',
      'share-collection.cancel',
      'share-collection.url',
      'share-collection.copy-link',
      'share-collection.done',
      'share-import.close',
      'share-import.cancel',
      'import-shared-collection.cancel',
      'share-status.chip',
      'share-status.close',
      'publish-scores.close',
      'publish-scores.level',
      'publish-scores.written-mode',
      'publish-scores.cancel',
      'quiz-import.cartridge-share-pictures',
      'quiz-import.paper-assignment',
      'quiz-banks.shared-preview',
      'quiz-results.student-delete-cancel',
      'quiz-rubric.share-link',
      'quiz-rubric.share-copy',
    ]);
    // Destination options and step headers only move through the Assign dialog.
    const opensOnly = (id: string) =>
      OPENS_ONLY.has(id) ||
      /^(assign-(destination|step)\.|plc-(assign|share)\.|admin-plc\.recovery-reassign)/.test(
        id
      ) ||
      /^(assign-(when|classes|students|students-legacy|mods|override|modal|targeting|availability|periods|per-class|settings|quiz-behavior|quiz-time|tab-warning|results-protection|video-behavior)|flashcards-assign|plc-video-assign|publish-scores|view-only-share)\./.test(
        id
      );
    const unflagged = Object.entries(TOUR_ANCHORS)
      .filter(([id]) => /assign|share|publish|delete/.test(id))
      .filter(([id, def]) => {
        const d = def as TourAnchorDef;
        return !d.persists && !d.destructive && !opensOnly(id);
      })
      .map(([id]) => id);
    expect(
      unflagged,
      `Tag these \`persists\` or \`destructive\` in config/tourAnchors.ts, or add them to OPENS_ONLY if they only open a dialog or edit a draft: ${unflagged.join(', ')}`
    ).toEqual([]);
  });

  it('gives every prerequisite a known value, and widget ones a widget scope', () => {
    for (const [id, def] of Object.entries(TOUR_ANCHORS)) {
      const requires = (def as TourAnchorDef).requires;
      if (requires === undefined) continue;
      expect(TOUR_ANCHOR_PREREQUISITES, id).toContain(requires);
      if (requires.startsWith('widget-')) {
        expect('perWidget' in def || 'perWidgetType' in def, id).toBe(true);
      }
      if (requires === 'settings-open') {
        expect('perWidget' in def || 'perField' in def, id).toBe(true);
      }
    }
  });

  // Help-menu items (`settings.help-menu.*`) also need their menu clicked open.
  it('opens the settings drawer for every drawer settings.* anchor', () => {
    const settingsIds = Object.keys(TOUR_ANCHORS).filter((id) =>
      /^settings\.[^.]+$/.test(id)
    );
    for (const id of settingsIds) {
      const def: TourAnchorDef = TOUR_ANCHORS[id as keyof typeof TOUR_ANCHORS];
      expect(def.requires, id).toBe('settings-open');
    }
  });
});

describe('findAnchorProblems', () => {
  const registry = ['dock.open-tools', 'widget.close'];

  it('reports a registered anchor whose tag was removed', () => {
    const files = [
      { path: 'a.tsx', text: "<button {...tourAttr('dock.open-tools')} />" },
    ];
    expect(findAnchorProblems(registry, files).missing).toEqual([
      'widget.close',
    ]);
  });

  it('reports an unregistered data-tour literal', () => {
    const files = [
      {
        path: 'a.tsx',
        text: `<button {...tourAttr('dock.open-tools')} />
<button {...tourAttr("widget.close", widget.id)} />
<div data-tour="ghost.anchor" />`,
      },
    ];
    expect(findAnchorProblems(registry, files)).toEqual({
      missing: [],
      unregistered: ['ghost.anchor (a.tsx)'],
    });
  });

  it('counts tourTypeAttr, tourFieldAttr and braced data-tour literals as uses', () => {
    const files = [
      {
        path: 'a.tsx',
        text: `<b {...tourTypeAttr('dock.open-tools', tool.type)} /><b {...tourFieldAttr('widget.close', type, key)} /><b data-tour={'widget.close'} />`,
      },
    ];
    expect(findAnchorProblems(registry, files).missing).toEqual([]);
  });

  it('ignores the other data-tour-* attributes', () => {
    const files = [
      {
        path: 'a.tsx',
        text: `<b data-tour-widget="w1" data-tour-ignore="" {...tourAttr('dock.open-tools')} {...tourAttr('widget.close')} />`,
      },
    ];
    expect(findAnchorProblems(registry, files).unregistered).toEqual([]);
  });
});
