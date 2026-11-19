import { describe, it, expect } from 'vitest';
import { carryPunctuation, lacksPunctuation } from './carryPunctuation';

describe('carryPunctuation', () => {
  it('keeps punctuation and capitals when the words are the same', () => {
    expect(
      carryPunctuation(
        ' The cat sat. It purred, loudly!',
        'the cat sat it purred loudly'
      )
    ).toBe(' The cat sat. It purred, loudly!');
  });

  it('carries punctuation across a corrected word', () => {
    expect(
      carryPunctuation(
        'The mite a condria is the powerhouse.',
        'the mitochondria is the powerhouse'
      )
    ).toBe('The mitochondria is the powerhouse.');
  });

  it('keeps a leading space and a new word in the middle', () => {
    expect(
      carryPunctuation(
        ' We went home, then slept.',
        'we all went home then slept'
      )
    ).toBe(' We all went home, then slept.');
  });

  it('handles Spanish and apostrophes', () => {
    expect(
      carryPunctuation("¿Dónde está? No don't.", "dónde está no don't")
    ).toBe("¿Dónde está? No don't.");
  });

  it('returns the transcript when nothing lines up', () => {
    expect(carryPunctuation('Hello.', 'goodbye now')).toBe('goodbye now');
  });
});

describe('lacksPunctuation', () => {
  it('spots a punctuated transcript', () => {
    expect(lacksPunctuation('the cat sat')).toBe(true);
    expect(lacksPunctuation('The cat sat.')).toBe(false);
  });
});
