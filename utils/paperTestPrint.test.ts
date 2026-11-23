import { describe, expect, it, vi } from 'vitest';
import {
  buildPaperTestHtml,
  PAPER_TEST_PACKET_STYLES,
  paperTestPacketCopies,
  printPaperTest,
} from './paperTestPrint';

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

  it('brands every page in the footer, like the bubble sheet', () => {
    expect(buildPaperTestHtml(job)).not.toContain('aria-label="SPARTRON"');
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const win = {
      document: doc,
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    printPaperTest(job, () => win as unknown as Window);
    const written = doc.write.mock.calls[0][0] as string;
    const footer = written.slice(
      written.indexOf('<tfoot>'),
      written.indexOf('</tfoot>')
    );
    expect(footer).toContain('aria-label="SPARTRON"');
    expect(footer).toContain('SpartBoard Responses');
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

describe('written questions on the test paper (D18)', () => {
  it('prints a written question in place with no choices, numbered by quiz position', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'Unit 3 Test',
      questions: [
        { row: '1', text: 'Capital of France?', choices: ['Lyon', 'Paris'] },
        { row: '2', text: 'Explain why.', choices: [], written: true },
        { row: '3', text: 'Pick one', choices: ['Red', 'Blue'] },
      ],
    });
    expect(html).toContain('<span class="num">2.</span>');
    expect(html).toContain('Write your answer on your response sheet.');
    expect(html.indexOf('Explain why.')).toBeLessThan(
      html.indexOf('Write your answer on your response sheet.')
    );
    expect(
      html.indexOf('Write your answer on your response sheet.')
    ).toBeLessThan(html.indexOf('Pick one'));
    expect(html.match(/class="letter"/g)).toHaveLength(4);
  });
});

describe('a translated test paper', () => {
  it("prints the resource and written lines in the copy's language", () => {
    const job = {
      quizTitle: 'Prueba',
      language: 'es',
      questions: [
        { row: '1', text: 'Lee.', choices: ['a', 'b'], resources: ['A'] },
        { row: '2', text: 'Explica.', choices: [], written: true },
      ],
      resources: [
        { letter: 'A', item: { kind: 'text' as const, text: 'Texto' } },
      ],
    };
    for (const html of [
      buildPaperTestHtml(job),
      ...paperTestPacketCopies(job),
    ]) {
      expect(html).toContain('Usa el recurso A.');
      expect(html).toContain('<h2>Recurso A</h2>');
      expect(html).toContain('Escribe tu respuesta en tu hoja de respuestas.');
      expect(html).not.toContain('Resource A');
    }
  });
});

describe('test paper copies inside the response sheet document', () => {
  it('prints one scoped copy per version', () => {
    const q = { row: 1, text: 'Pick one', choices: ['Red', 'Blue'] };
    const copies = paperTestPacketCopies({
      quizTitle: 'Unit 3 Test',
      questions: [],
      versions: [
        { label: 'Version A', questions: [q] },
        { label: 'Version B', questions: [q] },
      ],
    });
    expect(copies).toHaveLength(2);
    expect(copies[1]).toContain('Version B');
    expect(copies.every((c) => c.startsWith('<div class="tp">'))).toBe(true);
    // Every rule is scoped, so the sheets' own classes are left alone.
    const rules = PAPER_TEST_PACKET_STYLES.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('{'));
    expect(rules.every((l) => l.startsWith('.tp'))).toBe(true);
  });
});
