import { describe, expect, it, vi } from 'vitest';
import { BOARD_TEMPLATES } from '@/config/boardTemplates';
import type { ActivityWallLibraryEntry } from '@/types';
import { createFlashcardImportAdapter } from '@/components/widgets/Flashcards/adapters/flashcardImportAdapter';
import {
  buildImportedWall,
  createActivityWallImportAdapter,
} from '@/components/widgets/ActivityWall/adapters/activityWallImportAdapter';
import {
  AI_CONVERSION_REVIEW_NOTE,
  AI_CONVERSION_TRUNCATED_NOTE,
  blocksToText,
  conversionInputFromSource,
  type ConversionInput,
} from './aiConversion';
import { planBoardFromImport } from './boardConversion';

vi.mock('@/config/firebase', () => ({ functions: {} }));

const INPUT: ConversionInput = {
  title: 'Water cycle',
  url: 'https://example.org',
  text: 'Evaporation and condensation.',
};

describe('blocksToText', () => {
  it('keeps headings, list items, quotes and table rows readable', () => {
    expect(
      blocksToText([
        { type: 'heading', level: 2, text: 'Terms' },
        { type: 'listItem', text: 'Vapor' },
        { type: 'quote', text: 'Rain falls' },
        { type: 'paragraph', text: '   ' },
        { type: 'table', rows: [{ cells: ['a', 'b'] }, { cells: ['c', 'd'] }] },
      ])
    ).toBe('## Terms\n\n- Vapor\n\n> Rain falls\n\na\tb\nc\td');
  });
});

describe('conversionInputFromSource', () => {
  it('reads a card set sent without its table as the page text', () => {
    expect(
      conversionInputFromSource({
        kind: 'send',
        item: {
          id: 'x',
          receivedAt: 1,
          url: 'https://quizlet.com/1/',
          title: 'Cells',
          platform: 'quizlet',
          selectionOnly: false,
          blocks: [{ type: 'heading', level: 1, text: 'Cells' }],
          images: [],
          cards: { cards: [{ term: 'cell', definition: 'unit of life' }] },
        },
      })?.text
    ).toBe('# Cells\n\ncell\tunit of life');
  });

  it('reads Sends, pasted text and read files, and not bare URLs', () => {
    expect(
      conversionInputFromSource({
        kind: 'send',
        item: {
          id: 'x',
          receivedAt: 1,
          url: 'https://a.org',
          title: 'A',
          platform: 'generic',
          selectionOnly: false,
          blocks: [{ type: 'paragraph', text: 'Hi' }],
          images: [],
        },
      })
    ).toEqual({ title: 'A', url: 'https://a.org', text: 'Hi' });
    expect(conversionInputFromSource({ kind: 'text', text: 'Hi' })).toEqual({
      title: '',
      url: '',
      text: 'Hi',
    });
    expect(
      conversionInputFromSource({ kind: 'url', url: 'https://a.org' })
    ).toBeNull();
    expect(
      conversionInputFromSource({
        kind: 'file',
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
      })
    ).toBeNull();
  });
});

describe('Flashcards conversion', () => {
  it('turns the AI result into reviewed cards with a suggested title', async () => {
    const convert = vi.fn(() =>
      Promise.resolve({
        target: 'flashcards' as const,
        title: 'Water',
        cards: [{ term: 'Vapor', definition: 'Gas water' }],
        truncated: true,
      })
    );
    const adapter = createFlashcardImportAdapter({
      loadSheet: vi.fn(),
      pickSheet: vi.fn(),
      save: vi.fn(),
      convert,
    });
    const result = await adapter.parse({ kind: 'conversion', input: INPUT });
    expect(convert).toHaveBeenCalledWith('flashcards', INPUT);
    expect(result.data.cards[0]).toMatchObject({
      term: 'Vapor',
      definition: 'Gas water',
    });
    expect(result.note).toBe(AI_CONVERSION_REVIEW_NOTE);
    expect(result.warnings).toEqual([AI_CONVERSION_TRUNCATED_NOTE]);
    expect(adapter.suggestTitle?.(result.data)).toBe('Water');
  });
});

describe('Activity Wall conversion', () => {
  const convert = vi.fn(() =>
    Promise.resolve({
      target: 'activityWall' as const,
      title: 'Water talk',
      prompt: 'Where have you seen condensation?',
      layout: 'columns' as const,
      columns: ['Home', 'School'],
      truncated: false,
    })
  );

  it('reads the prompt and columns into the review data', async () => {
    const adapter = createActivityWallImportAdapter({
      defaults: {},
      save: vi.fn(),
      convert,
    });
    const { data, note } = await adapter.parse({
      kind: 'conversion',
      input: INPUT,
    });
    expect(data.prompt).toBe('Where have you seen condensation?');
    expect(data.sections.map((s) => s.label)).toEqual(['Home', 'School']);
    expect(note).toBe(AI_CONVERSION_REVIEW_NOTE);
    expect(adapter.validate(data).ok).toBe(true);
    expect(adapter.validate({ ...data, prompt: ' ' }).ok).toBe(false);
    expect(
      adapter.validate({ ...data, sections: [{ id: 'a', label: '' }] }).ok
    ).toBe(false);
  });

  it('refuses anything but a conversion', async () => {
    const adapter = createActivityWallImportAdapter({
      defaults: {},
      save: vi.fn(),
      convert,
    });
    await expect(adapter.parse({ kind: 'csv', text: 'a,b' })).rejects.toThrow();
  });

  it('saves a new wall with no posts on the building defaults', async () => {
    const save = vi.fn((_entry: ActivityWallLibraryEntry) => Promise.resolve());
    const adapter = createActivityWallImportAdapter({
      defaults: { showNames: true },
      save,
      convert,
    });
    await adapter.save(
      {
        title: 'x',
        prompt: ' Why? ',
        layout: 'columns',
        sections: [
          { id: 'a', label: ' Home ' },
          { id: 'b', label: '' },
        ],
      },
      ' My wall '
    );
    const entry = save.mock.calls[0][0];
    expect(entry).toMatchObject({
      title: 'My wall',
      prompt: 'Why?',
      layout: 'columns',
      mode: 'photo',
      showNames: true,
      identificationMode: 'name',
      sections: [{ id: 'a', label: 'Home' }],
    });
    expect(entry).not.toHaveProperty('submissions');
  });

  it('drops columns on other layouts and maps word clouds to text mode', () => {
    const wall = buildImportedWall(
      {
        title: '',
        prompt: 'One word',
        layout: 'wordcloud',
        sections: [{ id: 'a', label: 'Home' }],
      },
      'T',
      {}
    );
    expect(wall.mode).toBe('text');
    expect(wall.sections).toBeUndefined();
  });
});

describe('planBoardFromImport', () => {
  const template = BOARD_TEMPLATES[0];
  const zone = template.zones[0].id;

  it('places the AI template for the screen and limits widgets', async () => {
    const convert = vi.fn(
      (
        _target: 'board',
        _input: ConversionInput,
        _opts: { allowedWidgets?: string[] }
      ) =>
        Promise.resolve({
          target: 'board' as const,
          title: 'Water',
          templateId: template.id,
          slots: [{ zoneId: zone, widgetType: 'text', config: {} }],
          truncated: false,
        })
    );
    const plan = await planBoardFromImport(
      INPUT,
      { screen: { w: 1920, h: 1080 }, canUseWidget: (t) => t === 'text' },
      convert
    );
    expect(convert.mock.calls[0]?.[2].allowedWidgets).toEqual(['text']);
    expect(plan.title).toBe('Water');
    expect(plan.widgets).toHaveLength(1);
    expect(plan.widgets[0].placement).toBeDefined();
  });

  it('throws when nothing can be placed', async () => {
    const convert = vi.fn(() =>
      Promise.resolve({
        target: 'board' as const,
        title: 'Water',
        templateId: template.id,
        slots: [{ zoneId: zone, widgetType: 'clock', config: {} }],
        truncated: false,
      })
    );
    await expect(
      planBoardFromImport(
        INPUT,
        { screen: { w: 1920, h: 1080 }, canUseWidget: (t) => t === 'text' },
        convert
      )
    ).rejects.toThrow();
  });
});
