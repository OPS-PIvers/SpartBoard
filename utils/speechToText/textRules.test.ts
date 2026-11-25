import { describe, expect, it } from 'vitest';
import { applyTextRules, startsSentence } from './textRules';

const run = (
  raw: string,
  textBefore = '',
  language = 'en',
  punctuates = false
) => applyTextRules(raw, { textBefore, language, punctuates });

const text = (...args: Parameters<typeof run>): string => {
  const out = run(...args);
  if (out.kind !== 'text') throw new Error(`expected text, got ${out.kind}`);
  return out.text;
};

describe('applyTextRules: capitals and spacing', () => {
  it('capitalises the start of the answer with no leading space', () => {
    expect(text('the cat sat')).toBe('The cat sat');
  });

  it('adds a leading space and keeps lower case mid-sentence', () => {
    expect(text('on the mat', 'The cat sat')).toBe(' on the mat');
  });

  it('adds no space when the text before ends in whitespace', () => {
    expect(text('on the mat', 'The cat sat ')).toBe('on the mat');
  });

  it('capitalises after sentence-ending punctuation', () => {
    expect(text('it was happy', 'The cat sat.')).toBe(' It was happy');
    expect(text('it was happy', 'Really? ')).toBe('It was happy');
    expect(text('it was happy', 'He said "stop."')).toBe(' It was happy');
  });

  it('capitalises after a new line with no space', () => {
    expect(text('next idea', 'First idea\n')).toBe('Next idea');
  });

  it('adds no space after opening punctuation', () => {
    expect(text('see below', 'The cat (')).toBe('see below');
    expect(text('hello', 'She said "')).toBe('hello');
    expect(text('hello', 'She said "hi"')).toBe(' hello');
  });

  it('capitalises standalone English i', () => {
    expect(text("i think i'm right and so am i", 'x')).toBe(
      " I think I'm right and so am I"
    );
    expect(text('it is in wi-fi', 'x')).toBe(' it is in wi-fi');
  });

  it('leaves i alone in other languages', () => {
    expect(text('padre i madre', 'x', 'es')).toBe(' padre i madre');
  });

  it('collapses whitespace and reports empty phrases', () => {
    expect(text('  two   words ')).toBe('Two words');
    expect(run('   ')).toEqual({ kind: 'empty' });
  });

  it('keeps capitals the engine already gave', () => {
    expect(text('Paris is nice', 'I think')).toBe(' Paris is nice');
  });
});

describe('applyTextRules: spoken punctuation (English)', () => {
  it('turns spoken marks into punctuation without a space before', () => {
    expect(text('hello comma world period')).toBe('Hello, world.');
    expect(text('is it full stop yes')).toBe('Is it. Yes');
    expect(text('really question mark wow exclamation point')).toBe(
      'Really? Wow!'
    );
    expect(text('wow exclamation mark')).toBe('Wow!');
    expect(text('two things colon one semicolon two')).toBe(
      'Two things: one; two'
    );
    expect(text('one semi colon two')).toBe('One; two');
  });

  it('handles new line and new paragraph', () => {
    expect(text('first new line second')).toBe('First\nSecond');
    expect(text('first new paragraph second')).toBe('First\n\nSecond');
  });

  it('puts a lone mark straight after the text before', () => {
    expect(text('period', 'The end')).toBe('.');
    expect(text('new line', 'The end.')).toBe('\n');
    expect(text('comma and then', 'First')).toBe(', and then');
  });

  it('is case-insensitive and ignores marks inside words', () => {
    expect(text('Stop Period go')).toBe('Stop. Go');
    expect(text('the periodic table and a commander')).toBe(
      'The periodic table and a commander'
    );
  });

  it('keeps "period" as a word after a determiner', () => {
    expect(text('the period ended period')).toBe('The period ended.');
    expect(text('in first period we read')).toBe('In first period we read');
  });

  it('keeps "colon" and "comma" as words after a determiner', () => {
    expect(text('the colon absorbs water period')).toBe(
      'The colon absorbs water.'
    );
    expect(text('a comma butterfly landed')).toBe('A comma butterfly landed');
    expect(text('list colon apples comma pears')).toBe('List: apples, pears');
  });

  it('leaves spoken marks alone when the engine punctuates', () => {
    expect(text('the comma is a mark.', '', 'en', true)).toBe(
      'The comma is a mark.'
    );
  });

  it('still capitalises inside an engine-punctuated phrase', () => {
    expect(text('yes. no? maybe', 'x.', 'en', true)).toBe(' Yes. No? Maybe');
  });
});

describe('applyTextRules: Spanish and Russian', () => {
  it('turns Spanish marks into punctuation', () => {
    expect(text('hola coma mundo punto', '', 'es')).toBe('Hola, mundo.');
    expect(text('uno punto y coma dos dos puntos tres', '', 'es')).toBe(
      'Uno; dos: tres'
    );
    expect(text('qué hora es signo de interrogación', '', 'es')).toBe(
      'Qué hora es?'
    );
    expect(
      text('abrir interrogacion cómo estás cerrar interrogación', '', 'es')
    ).toBe('¿Cómo estás?');
    expect(text('uno nueva línea dos nuevo parrafo tres', '', 'es')).toBe(
      'Uno\nDos\n\nTres'
    );
    expect(text('fin punto y aparte otra', '', 'es')).toBe('Fin.\nOtra');
  });

  it('keeps "punto" and "coma" as words after a determiner', () => {
    expect(text('llegó a las tres en punto punto', '', 'es')).toBe(
      'Llegó a las tres en punto.'
    );
    expect(text('es un punto clave coma sí', '', 'es')).toBe(
      'Es un punto clave, sí'
    );
    expect(text('estuvo en coma punto', '', 'es')).toBe('Estuvo en coma.');
  });

  it('does not apply English marks in Spanish', () => {
    expect(text('el period comma', '', 'es-US')).toBe('El period comma');
  });

  it('turns Russian marks into punctuation', () => {
    expect(text('привет запятая мир точка', '', 'ru')).toBe('Привет, мир.');
  });

  it('applies no spoken marks in a language without a list', () => {
    expect(text('waa period', '', 'so')).toBe('Waa period');
  });
});

describe('applyTextRules: undo', () => {
  it('detects the undo command', () => {
    expect(run('undo that', 'x')).toEqual({ kind: 'undo' });
    expect(run(' Undo that. ', 'x')).toEqual({ kind: 'undo' });
    expect(run('undo that', 'x', 'en', true)).toEqual({ kind: 'undo' });
    expect(run('deshacer', 'x', 'es')).toEqual({ kind: 'undo' });
    expect(run('Deshacer eso', 'x', 'es')).toEqual({ kind: 'undo' });
  });

  it('treats the words inside a longer phrase as text', () => {
    expect(text('please undo that now', 'x')).toBe(' please undo that now');
    expect(text('undo', '')).toBe('Undo');
    expect(text('deshacer', 'x', 'en')).toBe(' deshacer');
  });
});

describe('startsSentence', () => {
  it('knows where a sentence starts', () => {
    expect(startsSentence('')).toBe(true);
    expect(startsSentence('   ')).toBe(true);
    expect(startsSentence('Done.  ')).toBe(true);
    expect(startsSentence('Line\n')).toBe(true);
    expect(startsSentence('¿')).toBe(true);
    expect(startsSentence('and then')).toBe(false);
    expect(startsSentence('one, ')).toBe(false);
  });
});
