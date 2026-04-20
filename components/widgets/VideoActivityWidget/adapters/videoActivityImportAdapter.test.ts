/**
 * Tests for videoActivityImportAdapter — restores regression coverage lost
 * when the legacy Manager.test.tsx was removed in the Wave-2 migration.
 * Focuses on the parse + validate paths (the highest-value, purely-functional
 * surface of the adapter) rather than the React render tree of the new
 * manager, which is still evolving as later waves land.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createVideoActivityImportAdapter,
  mmSsToSeconds,
  secondsToMmSs,
  validateVideoActivityData,
} from './videoActivityImportAdapter';
import type { VideoActivityData, VideoActivityQuestion } from '@/types';

// crypto.randomUUID() is a built-in in Node 24+, which this project requires,
// so no shim is needed. We still assert the questions get unique ids.

function makeQuestion(
  overrides: Partial<VideoActivityQuestion> = {}
): VideoActivityQuestion {
  return {
    id: 'q1',
    timestamp: 10,
    text: 'What?',
    type: 'MC',
    correctAnswer: 'A',
    incorrectAnswers: ['B'],
    timeLimit: 30,
    ...overrides,
  };
}

function makeData(
  overrides: Partial<VideoActivityData> = {}
): VideoActivityData {
  return {
    id: 'act-1',
    title: 'Test',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [makeQuestion()],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('videoActivityImportAdapter', () => {
  describe('mmSsToSeconds', () => {
    it('converts MM:SS to seconds', () => {
      expect(mmSsToSeconds('01:30')).toBe(90);
      expect(mmSsToSeconds('10:05')).toBe(605);
      expect(mmSsToSeconds('0:30')).toBe(30);
      expect(mmSsToSeconds('00:00')).toBe(0);
    });

    it('returns NaN for malformed input', () => {
      expect(Number.isNaN(mmSsToSeconds('bad'))).toBe(true);
      expect(Number.isNaN(mmSsToSeconds('1:2:3'))).toBe(true);
      // 60 seconds is invalid — must roll to next minute
      expect(Number.isNaN(mmSsToSeconds('01:60'))).toBe(true);
    });

    it('returns 0 for empty string', () => {
      expect(mmSsToSeconds('')).toBe(0);
    });
  });

  describe('secondsToMmSs', () => {
    it('pads minutes and seconds to two digits', () => {
      expect(secondsToMmSs(90)).toBe('01:30');
      expect(secondsToMmSs(0)).toBe('00:00');
      expect(secondsToMmSs(605)).toBe('10:05');
    });

    it('clamps negative values to 00:00', () => {
      expect(secondsToMmSs(-10)).toBe('00:00');
    });
  });

  describe('validateVideoActivityData', () => {
    it('passes for a valid dataset', () => {
      const result = validateVideoActivityData(makeData());
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects an empty question list', () => {
      const result = validateVideoActivityData(makeData({ questions: [] }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/at least one/i);
    });

    it('rejects non-increasing timestamps', () => {
      const data = makeData({
        questions: [
          makeQuestion({ id: 'q1', timestamp: 30 }),
          makeQuestion({ id: 'q2', timestamp: 10 }),
        ],
      });
      const result = validateVideoActivityData(data);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /not after/i.test(e))).toBe(true);
    });

    it('rejects duplicate timestamps', () => {
      const data = makeData({
        questions: [
          makeQuestion({ id: 'q1', timestamp: 10 }),
          makeQuestion({ id: 'q2', timestamp: 10 }),
        ],
      });
      const result = validateVideoActivityData(data);
      expect(result.ok).toBe(false);
    });

    it('flags missing question text', () => {
      const data = makeData({ questions: [makeQuestion({ text: '' })] });
      const result = validateVideoActivityData(data);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /text/i.test(e))).toBe(true);
    });

    it('flags missing correct answer', () => {
      const data = makeData({
        questions: [makeQuestion({ correctAnswer: '' })],
      });
      const result = validateVideoActivityData(data);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /correct answer/i.test(e))).toBe(true);
    });
  });

  describe('createVideoActivityImportAdapter', () => {
    const baseOptions = () => ({
      title: 'My Activity',
      youtubeUrl: 'https://youtu.be/xyz',
      onSave: vi.fn<(data: VideoActivityData, title: string) => Promise<void>>(
        () => Promise.resolve()
      ),
    });

    it('declares supported sources and widget label', () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      expect(adapter.widgetLabel).toBe('Video Activity');
      expect(adapter.supportedSources).toContain('csv');
      expect(adapter.supportedSources).toContain('file');
    });

    it('parses a CSV payload into sorted questions', async () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      const csv = [
        '02:00,"Second?","yes","no"',
        '01:00,"First?","a","b","c"',
      ].join('\n');
      const result = await adapter.parse({ kind: 'csv', text: csv });
      expect(result.data.questions.length).toBe(2);
      // Sorted ascending by timestamp
      expect(result.data.questions[0]?.timestamp).toBe(60);
      expect(result.data.questions[1]?.timestamp).toBe(120);
      expect(result.data.title).toBe('My Activity');
      expect(result.data.youtubeUrl).toBe('https://youtu.be/xyz');
    });

    it('stamps new ids on every parsed question', async () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      const csv = ['00:30,"Q1","A","B"', '01:30,"Q2","C","D"'].join('\n');
      const result = await adapter.parse({ kind: 'csv', text: csv });
      const ids = new Set(result.data.questions.map((q) => q.id));
      expect(ids.size).toBe(2);
    });

    it('rejects invalid timestamp rows with a line-number error', async () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      const csv = '01:99,"Bad row","A","B"';
      await expect(adapter.parse({ kind: 'csv', text: csv })).rejects.toThrow(
        /line 1/i
      );
    });

    it('rejects missing question text / answer', async () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      const csv = '00:30,,"A","B"';
      await expect(adapter.parse({ kind: 'csv', text: csv })).rejects.toThrow(
        /Missing question text/i
      );
    });

    it('rejects JSON payloads (CSV is the canonical import format)', async () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      await expect(adapter.parse({ kind: 'json', text: '{}' })).rejects.toThrow(
        /not supported/i
      );
    });

    it('rejects Sheet payloads with a clear paste-CSV hint', async () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      await expect(
        adapter.parse({
          kind: 'sheet',
          url: 'https://docs.google.com/spreadsheets/d/foo',
        })
      ).rejects.toThrow(/CSV/i);
    });

    it('invokes onSave with a trimmed title when saving', async () => {
      const options = baseOptions();
      const adapter = createVideoActivityImportAdapter(options);
      const data = makeData({ title: 'Original' });
      await adapter.save(data, '  Final Title  ');
      expect(options.onSave).toHaveBeenCalledTimes(1);
      const [savedData, savedTitle] = options.onSave.mock.calls[0] ?? [];
      expect(savedData?.title).toBe('Final Title');
      expect(savedTitle).toBe('Final Title');
    });

    it('exposes an AI-assist path when configured', () => {
      const adapter = createVideoActivityImportAdapter({
        ...baseOptions(),
        aiAssist: {
          promptPlaceholder: 'Describe the video…',
          generate:
            vi.fn<(ctx: { prompt: string }) => Promise<VideoActivityData>>(),
        },
      });
      expect(adapter.aiAssist).toBeDefined();
      expect(adapter.aiAssist?.promptPlaceholder).toContain('Describe');
    });

    it('omits the template helper when createTemplateSheet is not supplied', () => {
      const adapter = createVideoActivityImportAdapter(baseOptions());
      expect(adapter.templateHelper).toBeUndefined();
    });
  });
});
