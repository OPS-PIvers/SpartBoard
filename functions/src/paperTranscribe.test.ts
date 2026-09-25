import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'ts' },
  }),
  storage: vi.fn(),
}));

import {
  buildTranscribeParts,
  buildTranscribeResponseSchema,
  cropMimeType,
  locateUncertainSpans,
  modelForTier,
  parseTranscribeResponse,
  transcribePaperPage,
  transcriptToHtml,
  type PaperTranscribeDeps,
} from './paperTranscribe';

const MODELS = { standardModel: 'std-model', advancedModel: 'adv-model' };

describe('modelForTier', () => {
  it('defaults to the standard model', () => {
    expect(modelForTier(undefined, MODELS)).toBe('std-model');
    expect(modelForTier('standard', MODELS)).toBe('std-model');
    expect(modelForTier('bogus', MODELS)).toBe('std-model');
  });
  it('uses the advanced model only when asked', () => {
    expect(modelForTier('advanced', MODELS)).toBe('adv-model');
  });
});

describe('transcriptToHtml', () => {
  it('makes one paragraph per blank-line break and joins wrapped lines', () => {
    expect(
      transcriptToHtml('The cell\nwall is strong.\n\nIt protects it.')
    ).toBe('<p>The cell wall is strong.</p><p>It protects it.</p>');
  });
  it('escapes markup from the model', () => {
    expect(transcriptToHtml('<script>x</script> & "q"')).toBe(
      '<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;</p>'
    );
  });
  it('returns empty for an empty or whitespace transcript', () => {
    expect(transcriptToHtml('')).toBe('');
    expect(transcriptToHtml(' \n\n ')).toBe('');
  });
});

describe('locateUncertainSpans', () => {
  it('finds phrases in order, including repeats', () => {
    const text = 'the frog the frog jumpd';
    expect(locateUncertainSpans(text, ['frog', 'frog', 'jumpd'])).toEqual([
      { start: 4, end: 8 },
      { start: 13, end: 17 },
      { start: 18, end: 23 },
    ]);
  });
  it('drops phrases that are missing, empty or not strings', () => {
    expect(locateUncertainSpans('abc', ['zzz', '', 3, null])).toEqual([]);
    expect(locateUncertainSpans('abc', 'abc')).toEqual([]);
  });
});

describe('parseTranscribeResponse', () => {
  it('returns each box in the order asked, keeping the student’s spelling', () => {
    const raw = JSON.stringify({
      boxes: [
        {
          questionId: 'q2',
          text: 'Becuz it is hot',
          uncertainSpans: ['Becuz'],
          illegible: false,
        },
        {
          questionId: 'q1',
          text: 'Photosynthesis',
          uncertainSpans: [],
          illegible: false,
        },
      ],
    });
    const out = parseTranscribeResponse(raw, ['q1', 'q2']);
    expect(out.map((b) => b.questionId)).toEqual(['q1', 'q2']);
    expect(out[1]).toEqual({
      questionId: 'q2',
      ok: true,
      rawTranscript: 'Becuz it is hot',
      html: '<p>Becuz it is hot</p>',
      uncertainSpans: [{ start: 0, end: 5 }],
      illegibleCount: 0,
    });
  });

  it('fails a box the model left out and ignores extra ones', () => {
    const raw = JSON.stringify({
      boxes: [
        { questionId: 'q1', text: 'yes', uncertainSpans: [], illegible: false },
        {
          questionId: 'zz',
          text: 'stray',
          uncertainSpans: [],
          illegible: false,
        },
      ],
    });
    const out = parseTranscribeResponse(raw, ['q1', 'q2']);
    expect(out[0].ok).toBe(true);
    expect(out[1]).toEqual({
      questionId: 'q2',
      ok: false,
      error: 'missing from the model reply',
    });
    expect(out).toHaveLength(2);
  });

  it('counts illegible marks and a fully illegible box', () => {
    const raw = JSON.stringify({
      boxes: [
        {
          questionId: 'q1',
          text: 'The [illegible] is [illegible]',
          uncertainSpans: [],
          illegible: false,
        },
        { questionId: 'q2', text: '', uncertainSpans: [], illegible: true },
      ],
    });
    const [a, b] = parseTranscribeResponse(raw, ['q1', 'q2']);
    expect(a.ok && a.illegibleCount).toBe(2);
    expect(b.ok && b.illegibleCount).toBe(1);
    expect(b.ok && b.html).toBe('');
  });

  it('fails every box on malformed JSON instead of throwing', () => {
    for (const raw of [
      'not json',
      '',
      '{"boxes": "nope"}',
      '{"boxes": [ {"questionId": "q1"',
    ]) {
      const out = parseTranscribeResponse(raw, ['q1']);
      expect(out).toHaveLength(1);
      expect(out[0].ok).toBe(false);
    }
  });

  it('accepts a fenced reply and keeps the first of duplicate ids', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        boxes: [
          {
            questionId: 'q1',
            text: 'first',
            uncertainSpans: [],
            illegible: false,
          },
          {
            questionId: 'q1',
            text: 'second',
            uncertainSpans: [],
            illegible: false,
          },
        ],
      }) +
      '\n```';
    const [box] = parseTranscribeResponse(raw, ['q1']);
    expect(box.ok && box.rawTranscript).toBe('first');
  });

  it('fails a box whose text is not a string', () => {
    const raw = JSON.stringify({ boxes: [{ questionId: 'q1', text: 42 }] });
    expect(parseTranscribeResponse(raw, ['q1'])[0].ok).toBe(false);
  });
});

describe('buildTranscribeParts and schema', () => {
  it('sends the prompt then each box id before its image', () => {
    const parts = buildTranscribeParts([
      {
        questionId: 'q1',
        image: { data: Buffer.from('a'), mimeType: 'image/webp' },
      },
    ]);
    expect(parts[0].text).toMatch(/never correct/i);
    expect(parts[1]).toEqual({ text: 'questionId: q1' });
    expect(parts[2]).toEqual({
      inlineData: {
        mimeType: 'image/webp',
        data: Buffer.from('a').toString('base64'),
      },
    });
  });
  it('requires every per-box field', () => {
    const schema = buildTranscribeResponseSchema();
    expect(schema.properties?.boxes?.items?.required).toEqual([
      'questionId',
      'text',
      'uncertainSpans',
      'illegible',
    ]);
  });
  it('picks the crop mime type by extension', () => {
    expect(cropMimeType('a/b/q1.webp')).toBe('image/webp');
    expect(cropMimeType('a/b/q1.PNG')).toBe('image/png');
  });
});

describe('transcribePaperPage', () => {
  it('makes one model call for the whole page with the tier’s model', async () => {
    const generate = vi.fn<PaperTranscribeDeps['generate']>(() =>
      Promise.resolve(
        JSON.stringify({
          boxes: [
            {
              questionId: 'q1',
              text: 'one',
              uncertainSpans: [],
              illegible: false,
            },
            {
              questionId: 'q2',
              text: 'two',
              uncertainSpans: [],
              illegible: false,
            },
          ],
        })
      )
    );
    const deps: PaperTranscribeDeps = {
      loadCrop: vi.fn((path: string) =>
        Promise.resolve({ data: Buffer.from(path), mimeType: 'image/webp' })
      ),
      resolveModel: vi.fn((tier) =>
        Promise.resolve(modelForTier(tier, MODELS))
      ),
      generate,
    };
    const out = await transcribePaperPage(
      [
        { questionId: 'q1', storagePath: 'p/q1.webp' },
        { questionId: 'q2', storagePath: 'p/q2.webp' },
      ],
      'standard',
      deps
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].model).toBe('std-model');
    expect(generate.mock.calls[0][0].parts).toHaveLength(5);
    expect(out.model).toBe('std-model');
    expect(out.boxes.map((b) => b.ok)).toEqual([true, true]);
  });

  it('lets a model error propagate so the job can fail and retry', async () => {
    const deps: PaperTranscribeDeps = {
      loadCrop: () =>
        Promise.resolve({ data: Buffer.from(''), mimeType: 'image/webp' }),
      resolveModel: () => Promise.resolve('std-model'),
      generate: () => Promise.reject(new Error('503')),
    };
    await expect(
      transcribePaperPage(
        [{ questionId: 'q1', storagePath: 'x.webp' }],
        'standard',
        deps
      )
    ).rejects.toThrow('503');
  });
});
