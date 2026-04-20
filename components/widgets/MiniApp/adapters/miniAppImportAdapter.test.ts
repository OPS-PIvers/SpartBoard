/**
 * Tests for miniAppImportAdapter — covers the purely-functional surfaces
 * (title derivation, parse warnings, validation, suggested title, import
 * ordering) so HTML file imports stay stable as the wizard evolves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MiniAppItem } from '@/types';
import {
  createMiniAppImportAdapter,
  parseMiniAppImport,
  titleFromFileName,
  titleFromHtml,
  validateMiniAppImport,
  type MiniAppImportData,
} from './miniAppImportAdapter';

const batchSet = vi.fn<(docRef: unknown, data: MiniAppItem) => void>();
const batchCommit = vi.fn<() => Promise<void>>(() => Promise.resolve());

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ __type: 'collection' })),
  doc: vi.fn((_ref: unknown, id: string) => ({ __type: 'doc', id })),
  writeBatch: vi.fn(() => ({
    set: batchSet,
    commit: batchCommit,
  })),
}));

vi.mock('@/config/firebase', () => ({
  db: { __type: 'mock-db' },
}));

describe('miniAppImportAdapter', () => {
  describe('titleFromFileName', () => {
    it('strips the extension and returns the stem', () => {
      expect(titleFromFileName('my-app.html')).toBe('my-app');
      expect(titleFromFileName('Some Game.htm')).toBe('Some Game');
    });

    it('falls back to "Untitled App" for empty / undefined input', () => {
      expect(titleFromFileName(undefined)).toBe('Untitled App');
      expect(titleFromFileName('')).toBe('Untitled App');
      expect(titleFromFileName('.html')).toBe('Untitled App');
    });

    it('truncates very long filenames', () => {
      const long = 'a'.repeat(200) + '.html';
      expect(titleFromFileName(long).length).toBe(100);
    });
  });

  describe('titleFromHtml', () => {
    it('prefers the <title> tag', () => {
      expect(
        titleFromHtml('<html><head><title>Hello</title></head></html>')
      ).toBe('Hello');
    });

    it('falls back to the first <h1> when <title> is missing', () => {
      expect(titleFromHtml('<html><body><h1>Hi there</h1></body></html>')).toBe(
        'Hi there'
      );
    });

    it('normalizes whitespace in titles', () => {
      expect(titleFromHtml('<title>  Multi\n  Line\t Title  </title>')).toBe(
        'Multi Line Title'
      );
    });

    it('extracts text safely from nested / malformed tags via DOMParser', () => {
      // Regex-based tag stripping would be bypassable here; DOMParser is not.
      const html = '<h1>Safe <scr<b>ipt>Title</h1>';
      expect(titleFromHtml(html)).not.toContain('<script');
      expect(titleFromHtml(html).length).toBeGreaterThan(0);
    });

    it('truncates to 100 characters', () => {
      const long = '<title>' + 'x'.repeat(150) + '</title>';
      expect(titleFromHtml(long).length).toBe(100);
    });

    it('returns "" when neither <title> nor <h1> is present', () => {
      expect(titleFromHtml('<div>no headings here</div>')).toBe('');
    });
  });

  describe('parseMiniAppImport', () => {
    it('reads html source and derives the title from <title>', async () => {
      const result = await parseMiniAppImport({
        kind: 'html',
        text: '<title>Flash Cards</title><body>Hi</body>',
        fileName: 'fallback.html',
      });
      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0].title).toBe('Flash Cards');
      expect(result.data.rows[0].html).toContain('<body>');
      expect(result.warnings).toEqual([]);
    });

    it('falls back to filename when the HTML has no title or h1', async () => {
      const result = await parseMiniAppImport({
        kind: 'html',
        text: '<div>no headings</div>',
        fileName: 'my-game.html',
      });
      expect(result.data.rows[0].title).toBe('my-game');
    });

    it('reads file sources and uses the file name for title fallback', async () => {
      // jsdom's File polyfill doesn't implement `.text()`, so hand-roll a
      // compatible object that satisfies the subset the adapter uses.
      const file = {
        name: 'FromFile.htm',
        text: () => Promise.resolve('<div>hi</div>'),
      } as unknown as File;
      const result = await parseMiniAppImport({ kind: 'file', file });
      expect(result.data.rows[0].title).toBe('FromFile');
    });

    it('rejects empty files', async () => {
      await expect(
        parseMiniAppImport({ kind: 'html', text: '   ' })
      ).rejects.toThrow(/empty/i);
    });

    it('warns (but does not reject) when the content does not look like HTML', async () => {
      const result = await parseMiniAppImport({
        kind: 'html',
        text: 'Just some text, no tags.',
        fileName: 'Plain.html',
      });
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toMatch(/doesn't look like HTML/i);
      expect(result.data.rows).toHaveLength(1);
    });

    it('rejects unsupported source kinds', async () => {
      await expect(
        parseMiniAppImport({ kind: 'json', text: '{}' })
      ).rejects.toThrow(/only accepts HTML/i);
    });
  });

  describe('validateMiniAppImport', () => {
    it('passes when at least one row is present', () => {
      const result = validateMiniAppImport({
        rows: [{ title: 'A', html: '<div/>' }],
      });
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('fails when there are no rows', () => {
      const result = validateMiniAppImport({ rows: [] });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('createMiniAppImportAdapter', () => {
    beforeEach(() => {
      batchSet.mockClear();
      batchCommit.mockClear();
    });

    it('suggests the derived title for single-row imports', () => {
      const adapter = createMiniAppImportAdapter('user-1');
      const data: MiniAppImportData = {
        rows: [{ title: 'Derived', html: '<div/>' }],
      };
      expect(adapter.suggestTitle?.(data)).toBe('Derived');
    });

    it('does not suggest a title for multi-row imports', () => {
      const adapter = createMiniAppImportAdapter('user-1');
      const data: MiniAppImportData = {
        rows: [
          { title: 'A', html: '<div/>' },
          { title: 'B', html: '<div/>' },
        ],
      };
      expect(adapter.suggestTitle?.(data)).toBeUndefined();
    });

    it('rejects save when not authenticated', async () => {
      const adapter = createMiniAppImportAdapter('');
      await expect(
        adapter.save({ rows: [{ title: 'x', html: '<div/>' }] }, 'T')
      ).rejects.toThrow(/not authenticated/i);
    });

    it('assigns strongly-negative orders so imports land above existing items', async () => {
      const adapter = createMiniAppImportAdapter('user-1');
      const before = Date.now();
      await adapter.save(
        { rows: [{ title: 'Derived', html: '<div/>' }] },
        'User Title'
      );
      const after = Date.now();

      expect(batchSet).toHaveBeenCalledTimes(1);
      const saved: MiniAppItem = batchSet.mock.calls[0][1];
      // Single row → order is exactly -baseTime.
      expect(saved.order ?? 0).toBeLessThanOrEqual(-before);
      expect(saved.order ?? 0).toBeGreaterThanOrEqual(-after);
      // Much smaller than MiniAppWidget's -1, -2, ... ordering.
      expect(saved.order ?? 0).toBeLessThan(-1_000_000);
      // Title the user typed wins over the derived one.
      expect(saved.title).toBe('User Title');
      expect(batchCommit).toHaveBeenCalledOnce();
    });

    it('preserves relative order for multi-row batches', async () => {
      const adapter = createMiniAppImportAdapter('user-1');
      await adapter.save(
        {
          rows: [
            { title: 'First', html: '<div/>' },
            { title: 'Second', html: '<div/>' },
            { title: 'Third', html: '<div/>' },
          ],
        },
        '' // No user title — per-row titles should be kept.
      );
      const saved: MiniAppItem[] = batchSet.mock.calls.map((c) => c[1]);
      const orders = saved.map((s) => s.order ?? 0);
      const titles = saved.map((s) => s.title);
      // Strictly ascending: index 0 (top) has smallest order.
      expect(orders[0]).toBeLessThan(orders[1]);
      expect(orders[1]).toBeLessThan(orders[2]);
      // All strongly negative.
      orders.forEach((o) => expect(o).toBeLessThan(-1_000_000));
      // Per-row titles kept in a multi-row import.
      expect(titles).toEqual(['First', 'Second', 'Third']);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
});
