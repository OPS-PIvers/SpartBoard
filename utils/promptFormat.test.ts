import { describe, expect, it } from 'vitest';
import {
  parsePromptInline,
  promptFormatHtml,
  stripPromptFormat,
} from './promptFormat';
import { plainMathText, plainPromptText } from './promptMath';
import { fillPromptEditor, readPromptEditor } from './promptEditorDom';

describe('parsePromptInline', () => {
  it('reads bold, italic, underline and bold italic', () => {
    expect(parsePromptInline('a **b** *c* ++d++ ***e***')).toEqual([
      'a ',
      { tag: 'b', children: ['b'] },
      ' ',
      { tag: 'i', children: ['c'] },
      ' ',
      { tag: 'u', children: ['d'] },
      ' ',
      { tag: 'b', children: [{ tag: 'i', children: ['e'] }] },
    ]);
  });

  it('leaves multiplication, C++ and lone marks alone', () => {
    for (const s of [
      '3*x*y',
      '2 * 3 * 4',
      'C++ and C++',
      '* note',
      'a ** b',
      'What is 2**3 + 3**2?',
      '(3+2)*5*(1+1)',
      'i++; j++',
      'x**2 + y**2',
    ]) {
      expect(parsePromptInline(s)).toEqual([s]);
    }
  });

  it('never splits an equation', () => {
    expect(parsePromptInline('**solve ⟦a*b*c⟧**')).toEqual([
      { tag: 'b', children: ['solve ⟦a*b*c⟧'] },
    ]);
    expect(parsePromptInline('⟦x**2⟧ and ⟦y**2⟧')).toEqual([
      '⟦x**2⟧ and ⟦y**2⟧',
    ]);
  });

  it('nests italic inside bold', () => {
    expect(parsePromptInline('**a *b***')).toEqual([
      { tag: 'b', children: ['a ', { tag: 'i', children: ['b'] }] },
    ]);
  });
});

describe('stripPromptFormat and plainPromptText', () => {
  it('drops marks and keeps list lines', () => {
    expect(stripPromptFormat('**Read** the *text*\n• ++one++\n1. two')).toBe(
      'Read the text\n• one\n1. two'
    );
    expect(plainPromptText('**Solve** ⟦x+1=2⟧')).toBe('Solve x+1=2');
    expect(plainMathText('I *think* ⟦x+1⟧')).toBe('I *think* x+1');
  });
});

describe('promptFormatHtml', () => {
  it('escapes text and turns marks into tags', () => {
    expect(promptFormatHtml('<b> **x** </b> & *y*')).toBe(
      '&lt;b&gt; <strong>x</strong> &lt;/b&gt; &amp; <em>y</em>'
    );
  });
});

describe('prompt editor DOM', () => {
  const roundTrip = (text: string) => {
    const el = document.createElement('div');
    fillPromptEditor(el, text);
    return readPromptEditor(el);
  };

  it('round-trips formatting, lists and blank lines', () => {
    for (const text of [
      '',
      'Plain prompt',
      'In your explanation:\n1. **Describe** the *conditions*\n2. ++Explain++ why\n\nThen • stays',
      '• one\n• two\ntext\n3. three',
      'Solve ⟦x*2⟧ and fill ___',
      '1) typed by hand\n- dash',
    ]) {
      expect(roundTrip(text)).toBe(text);
    }
  });

  it('keeps part-word and touching formats readable', () => {
    for (const html of [
      '<p><i>un</i>happy</p>',
      '<p><i>a</i><b>b</b></p>',
      '<p>re<b>do</b>ne and <u>x</u>, <b>y</b>.</p>',
    ]) {
      const el = document.createElement('div');
      el.innerHTML = html;
      const text = readPromptEditor(el);
      const back = document.createElement('div');
      fillPromptEditor(back, text);
      expect(back.innerHTML).toBe(el.innerHTML);
      expect(readPromptEditor(back)).toBe(text);
      expect(stripPromptFormat(text)).toBe(el.textContent);
    }
  });

  it('reads what the browser makes when formatting', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<p>A <b>bold </b><b>run</b> and <span style="font-style: italic">tilt</span></p><div>next<br>line</div><ol><li>x</li><li><u>y</u></li></ol><p><br></p>';
    expect(readPromptEditor(el)).toBe(
      'A **bold run** and *tilt*\nnext\nline\n1. x\n2. ++y++\n'
    );
  });
});
