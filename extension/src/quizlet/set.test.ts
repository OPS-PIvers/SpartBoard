import { describe, expect, it } from 'vitest';
import {
  CARD_TABLE_MAX_BYTES,
  cardSetBlocks,
  cardSetFromItems,
  quizletSetId,
  quizletTitle,
  readQuizletSet,
} from './set';
import sample from './fixtures/studiableItems.json';

const items = sample.responses[0].models.studiableItem;

describe('quizletSetId', () => {
  it.each([
    ['https://quizlet.com/555123/spanish-animals-flash-cards/', '555123'],
    ['https://quizlet.com/gb/555123/spanish-animals-flash-cards/', '555123'],
    ['https://quizlet.com/en-gb/555123/x/', '555123'],
    ['https://quizlet.com/555123/learn', '555123'],
    ['https://www.quizlet.com/555123/', '555123'],
    ['https://quizlet.com/subject/photosynthesis/', null],
    ['https://quizlet.com/user/teacher/sets', null],
    ['https://evil.example/555123/', null],
    ['not a url', null],
  ])('%s', (href, id) => {
    expect(quizletSetId(href)).toBe(id);
  });
});

describe('quizletTitle', () => {
  it.each([
    ['Spanish Animals Flashcards | Quizlet', 'Spanish Animals'],
    ['Unit 3 Vocab | Quizlet', 'Unit 3 Vocab'],
    [' | Quizlet', 'Quizlet set'],
  ])('%s', (title, want) => {
    expect(quizletTitle(title)).toBe(want);
  });
});

describe('cardSetFromItems', () => {
  it('reads cards in set order with side languages and counts what it leaves out', () => {
    expect(cardSetFromItems(items)).toEqual({
      ok: true,
      set: {
        cards: [
          { term: 'el perro', definition: 'the dog' },
          { term: 'el gato', definition: 'the cat' },
          { term: 'la casa', definition: 'the house\nthe home' },
        ],
        termLanguage: 'es',
        definitionLanguage: 'en',
        leftOut: { picture: 1, audio: 1, diagram: 1 },
      },
    });
  });

  it('keeps a picture-only definition as blank so the review can say so', () => {
    const read = cardSetFromItems([
      {
        cardSides: [
          { label: 'word', media: [{ type: 1, plainText: 'heart' }] },
          { label: 'definition', media: [{ type: 2, url: 'https://x/y.png' }] },
        ],
      },
    ]);
    expect(read).toEqual({
      ok: true,
      set: {
        cards: [{ term: 'heart', definition: '' }],
        leftOut: { picture: 1 },
      },
    });
  });

  it('ignores a language code that is not a tag', () => {
    const read = cardSetFromItems([
      {
        cardSides: [
          {
            label: 'word',
            media: [{ type: 1, plainText: 'a', languageCode: 'x y' }],
          },
          { label: 'definition', media: [{ type: 1, plainText: 'b' }] },
        ],
      },
    ]);
    expect(read.ok && read.set).not.toHaveProperty('termLanguage');
  });

  it('reports a set with no cards', () => {
    expect(cardSetFromItems([{ cardSides: [] }, 'x'])).toEqual({
      ok: false,
      reason: 'no cards in the set data',
    });
  });
});

describe('cardSetBlocks', () => {
  it('writes the set as a two-column table under its title', () => {
    expect(
      cardSetBlocks('Animals', {
        cards: [
          { term: 'el perro', definition: 'the dog' },
          { term: '', definition: '' },
        ],
      })
    ).toEqual([
      { type: 'heading', level: 1, text: 'Animals' },
      { type: 'table', rows: [{ cells: ['el perro', 'the dog'] }] },
    ]);
  });

  it('sends only the title for a set too big to repeat as a table', () => {
    const definition = 'd'.repeat(CARD_TABLE_MAX_BYTES / 100);
    const cards = Array.from({ length: 101 }, () => ({
      term: 't',
      definition,
    }));
    expect(cardSetBlocks('Big', { cards })).toEqual([
      { type: 'heading', level: 1, text: 'Big' },
    ]);
  });
});

describe('readQuizletSet', () => {
  it('asks Quizlet for the set by id and reads the reply', async () => {
    const asked: string[] = [];
    const read = await readQuizletSet('555123', (url) => {
      asked.push(url);
      return Promise.resolve(sample);
    });
    expect(asked).toHaveLength(1);
    const url = new URL(asked[0]);
    expect(url.origin + url.pathname).toBe(
      'https://quizlet.com/webapi/3.4/studiable-item-documents'
    );
    expect(url.searchParams.get('filters[studiableContainerId]')).toBe(
      '555123'
    );
    expect(read.ok && read.set.cards).toHaveLength(3);
  });

  it('follows the paging token until a short page', async () => {
    const card = (n: number) => ({
      rank: n,
      cardSides: [
        { label: 'word', media: [{ type: 1, plainText: `t${n}` }] },
        { label: 'definition', media: [{ type: 1, plainText: `d${n}` }] },
      ],
    });
    const pages = [
      { items: Array.from({ length: 500 }, (_, i) => card(i)), token: 'a' },
      { items: [card(500)], token: 'b' },
    ];
    const asked: URL[] = [];
    const read = await readQuizletSet('1', (url) => {
      asked.push(new URL(url));
      const p = pages[asked.length - 1];
      return Promise.resolve({
        responses: [
          { models: { studiableItem: p.items }, paging: { token: p.token } },
        ],
      });
    });
    expect(asked.map((u) => u.searchParams.get('pagingToken'))).toEqual([
      null,
      'a',
    ]);
    expect(read.ok && read.set.cards).toHaveLength(501);
  });

  it('reports a failed read so Send can fall back', async () => {
    expect(
      await readQuizletSet('1', () =>
        Promise.reject(new Error('Quizlet answered 403'))
      )
    ).toEqual({ ok: false, reason: 'Quizlet answered 403' });
    expect(await readQuizletSet('1', () => Promise.resolve({}))).toEqual({
      ok: false,
      reason: 'unexpected set data',
    });
  });
});
