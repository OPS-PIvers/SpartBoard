import { describe, expect, it } from 'vitest';
import { spokenVariants } from './spokenVariants';

describe('spokenVariants', () => {
  it.each([
    ['la mesa', ['la mesa']],
    ['casa / hogar', ['casa', 'hogar']],
    ['el/la guía', ['el guía', 'la guía']],
    ['el/la mesero/a', ['el mesero', 'la mesera']],
    ['los/las chicos/as', ['los chicos', 'las chicas']],
    ['el/la profesor/a', ['el profesor', 'la profesora']],
    ['la flor/es', ['la flor', 'la flores']],
    ['este/a', ['este', 'esta']],
    ['ese/a', ['ese', 'esa']],
    ['inglés/esa', ['inglés', 'inglesa']],
    ['francés/a', ['francés', 'francesa']],
    ['alemán/a', ['alemán', 'alemana']],
    ['dormilón/ona', ['dormilón', 'dormilona']],
    ['el papel/es', ['el papel', 'el papeles']],
    ['un/una amigo/a', ['un amigo', 'una amiga']],
    ['Le traigo...', ['Le traigo']],
    ['¿Podría tener...?', ['¿Podría tener']],
    ['¿Me trae…por favor?', ['¿Me trae por favor?']],
    ['la especialidad (de la casa)', ['la especialidad']],
    ['Quisiera / Me gustaría', ['Quisiera', 'Me gustaría']],
  ])('%s', (term, texts) => {
    expect(spokenVariants(term).texts).toEqual(texts);
  });

  it('drops variants over four words and says so', () => {
    expect(spokenVariants('Tengo una reserva a nombre de...')).toEqual({
      texts: [],
      tooManyWords: true,
    });
  });

  it('caps the variants it looks up', () => {
    expect(spokenVariants('a / b / c / d / e / f').texts).toHaveLength(4);
  });

  it('pairs slash words with different option counts by position', () => {
    expect(spokenVariants('el/la buen/buena/gran día').texts).toEqual([
      'el buen día',
      'la buena día',
      'la gran día',
    ]);
  });

  it('counts digits as words', () => {
    expect(spokenVariants('1 2 3 4 5').tooManyWords).toBe(true);
  });

  it('ignores a term with nothing to say', () => {
    expect(spokenVariants('?! / …')).toEqual({
      texts: [],
      tooManyWords: false,
    });
  });
});
