import { describe, expect, it, vi } from 'vitest';
import { buildPaperTestHtml, printPaperTest } from './paperTestPrint';

const job = {
  quizTitle: 'Unit 3 Test',
  questions: [
    { row: 1, text: 'Capital of France?', choices: ['Lyon', 'Paris', 'Nice'] },
    { row: 2, text: 'Water boils at 100 °C', choices: ['True', 'False'] },
  ],
};

describe('buildPaperTestHtml', () => {
  it('numbers questions to match the answer sheet and letters choices in the given order', () => {
    const html = buildPaperTestHtml(job);
    expect(html).toContain('<span class="num">1.</span>');
    expect(html).toContain('<span class="num">2.</span>');
    const letters = [...html.matchAll(/class="letter">([A-E])\./g)].map(
      (m) => m[1]
    );
    expect(letters).toEqual(['A', 'B', 'C', 'A', 'B']);
    expect(html.indexOf('Lyon')).toBeLessThan(html.indexOf('Paris'));
    expect(html.indexOf('Paris')).toBeLessThan(html.indexOf('Nice'));
  });

  it('brands the test paper above the title', () => {
    const html = buildPaperTestHtml(job);
    expect(html.indexOf('aria-label="SPARTRON"')).toBeLessThan(
      html.indexOf('<h1>')
    );
    expect(html).toContain('SpartBoard Responses');
  });

  it('prints only the question when its options are placeholder letters', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'Vocab',
      questions: [
        { row: 1, text: 'Define pariah.', choices: ['B', 'C', 'D', 'A'] },
        { row: 2, text: 'Pick one', choices: ['A', 'Paris'] },
      ],
    });
    expect(html).toContain('Define pariah.');
    const letters = [...html.matchAll(/class="letter">([A-E])\./g)].map(
      (m) => m[1]
    );
    expect(letters).toEqual(['A', 'B']);
  });

  it('escapes question and choice text', () => {
    const html = buildPaperTestHtml({
      quizTitle: '<b>',
      questions: [{ row: 1, text: '2 < 3 & 4 > 1', choices: ['"yes"', 'no'] }],
    });
    expect(html).not.toContain('<b>');
    expect(html).toContain('2 &lt; 3 &amp; 4 &gt; 1');
    expect(html).toContain('&quot;yes&quot;');
  });
});

describe('printPaperTest', () => {
  it('writes the document and prints it', () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const win = {
      document: doc,
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    printPaperTest(job, () => win as unknown as Window);
    expect(doc.write.mock.calls[0][0]).toContain('Unit 3 Test — test');
    expect(doc.write.mock.calls[0][0]).toContain('Capital of France?');
    expect(win.print).toHaveBeenCalledOnce();
  });

  it('draws its own page margins so the browser prints no URL footer', () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const win = {
      document: doc,
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    printPaperTest(job, () => win as unknown as Window);
    const written = doc.write.mock.calls[0][0] as string;
    expect(written).toContain('@page { margin: 0; }');
    expect(written).toContain('<table class="page-margins">');
  });

  it('reports a blocked pop-up and prints nothing for an empty test', () => {
    expect(() => printPaperTest(job, () => null)).toThrow(/pop-ups/i);
    const open = vi.fn();
    printPaperTest({ quizTitle: 'x', questions: [] }, open);
    expect(open).not.toHaveBeenCalled();
  });
});
