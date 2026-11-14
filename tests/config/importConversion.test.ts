import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPORT_CONVERSION_SETTINGS,
  IMPORT_AI_TARGETS,
  IMPORT_SOURCE_KINDS,
  IMPORT_SOURCE_TARGETS,
  importAiDailyLimit,
  importAiOn,
  importSourceChecked,
  importSourceOffers,
  legacyAiSwitch,
  normalizeImportConversionSettings,
} from '@/config/importConversion';
import {
  importSourceKind,
  targetChoices,
} from '@/components/import/importTargets';
import { sourceFromInboxItem } from '@/components/import/sourceFromInbox';
import type { PendingSource } from '@/components/import/importHandoff';
import type { ImportInboxItem } from '@/utils/import/contract';
import {
  IMPORT_AI_TARGET_SOURCES,
  importAiAccess,
} from '@/functions/src/importSettings';

const file = (name: string, type = '') => new File(['x'], name, { type });
const page = (over: Partial<ImportInboxItem> = {}): ImportInboxItem => ({
  id: 'p',
  url: 'https://example.org/water',
  title: 'Water',
  platform: 'generic',
  selectionOnly: false,
  receivedAt: 1,
  images: [],
  blocks: [{ type: 'paragraph', text: 'Evaporation turns water to vapor.' }],
  ...over,
});

const SAMPLES: [PendingSource, string][] = [
  [{ url: 'https://example.org/page' }, 'web'],
  [sourceFromInboxItem(page()), 'web'],
  [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, 'youtube'],
  [
    sourceFromInboxItem(
      page({ url: 'https://docs.google.com/presentation/d/abc/edit' })
    ),
    'slides',
  ],
  [{ file: file('terms.csv', 'text/csv') }, 'spreadsheet'],
  [{ file: file('notes.pdf', 'application/pdf') }, 'document'],
  [{ file: file('essay.docx') }, 'document'],
  [{ file: file('walk.gl.json') }, 'document'],
  [{ file: file('cat.png', 'image/png') }, 'picture'],
  [{ file: file('deck.pptx') }, 'slides'],
  [{ file: file('game.html', 'text/html') }, 'webPageFile'],
  [{ file: file('bio.imscc') }, 'course'],
  [{ file: file('lesson.notebook') }, 'notebook'],
  [{ text: 'cell\tunit of life\natom\tsmallest part\nion\tcharged' }, 'text'],
  [{ text: 'What would you change about recess?' }, 'text'],
];

describe('import settings', () => {
  it('reads a missing or old doc as every import on with every widget, AI on the old switch', () => {
    const old = normalizeImportConversionSettings({ enabled: true });
    for (const kind of IMPORT_SOURCE_KINDS) {
      expect(importSourceChecked(old, kind)).toEqual(
        IMPORT_SOURCE_TARGETS[kind]
      );
      expect(old.sources[kind].enabled).toBe(true);
    }
    for (const t of IMPORT_AI_TARGETS) expect(importAiOn(old, t)).toBe(true);
    expect(normalizeImportConversionSettings(null)).toEqual(
      DEFAULT_IMPORT_CONVERSION_SETTINGS
    );
    expect(importAiOn(DEFAULT_IMPORT_CONVERSION_SETTINGS, 'board')).toBe(false);
  });

  it('keeps unchecked widgets, per-widget AI and limits, and drops junk', () => {
    const s = normalizeImportConversionSettings({
      enabled: true,
      sources: {
        web: { enabled: false, off: ['embed', 'quiz', 7] },
        bogus: { enabled: false },
      },
      ai: {
        board: { enabled: false, dailyLimit: 5 },
        flashcards: { dailyLimit: 0 },
      },
    });
    expect(s.sources.web).toEqual({ enabled: false, off: ['embed'] });
    expect(importSourceOffers(s, 'web', 'links')).toBe(false);
    expect(importSourceOffers(s, 'document', 'quiz')).toBe(true);
    expect(importAiOn(s, 'board')).toBe(false);
    expect(importAiOn(s, 'flashcards')).toBe(true);
    expect(importAiOn(s, 'quiz')).toBe(false);
    expect(importAiDailyLimit(s, 'board', 20)).toBe(5);
    expect(importAiDailyLimit(s, 'flashcards', 12)).toBe(12);
    expect(importAiDailyLimit(s, 'activityWall', undefined)).toBe(20);
    expect(legacyAiSwitch(s)).toBe(true);
  });

  it('files each Source under one import kind', () => {
    for (const [source, kind] of SAMPLES)
      expect(importSourceKind(source)).toBe(kind);
  });

  it('lists in each kind every widget Import can offer for it, so unchecking always works', () => {
    for (const [source] of SAMPLES) {
      const kind = importSourceKind(source);
      const { targets } = targetChoices(source, () => true, true);
      for (const t of targets)
        expect(IMPORT_SOURCE_TARGETS[kind], `${kind} ${t}`).toContain(t);
    }
  });

  it('matches the server: the kinds that list each AI widget, and the same switch result', () => {
    for (const t of IMPORT_AI_TARGETS) {
      const kinds = IMPORT_SOURCE_KINDS.filter((k) =>
        IMPORT_SOURCE_TARGETS[k].includes(t)
      );
      expect([...IMPORT_AI_TARGET_SOURCES[t]].sort()).toEqual(
        [...kinds].sort()
      );
      const raw = {
        enabled: true,
        sources: Object.fromEntries(
          kinds.map((k) => [k, { enabled: k === kinds[0], off: [t] }])
        ),
      };
      const client = normalizeImportConversionSettings(raw);
      const clientOn =
        importAiOn(client, t) &&
        kinds.some((k) => importSourceOffers(client, k, t));
      expect(importAiAccess(raw, t, 20).on).toBe(clientOn);
    }
  });
});
