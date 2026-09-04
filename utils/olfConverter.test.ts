import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import JSZip from 'jszip';
import {
  convertOlfToBundle,
  isOlfFile,
  matrixToSvg,
  parseRtf,
  repairEncoding,
  splitArgb,
  MeasureText,
} from './olfConverter';
import { parseNotebookFile } from './notebookParser';

const SAMPLE_PATH =
  'C:\\Users\\PAUL~1.IVE\\AppData\\Local\\Temp\\claude\\C--Users-paul-ivers-Desktop-Code-SpartBoard--claude-worktrees-spartboard-realtime-sync-ee34e1\\037b0c15-7e63-4766-a7ef-cb86131dc6cc\\scratchpad\\olf\\sample.olf';

// Monospace stub: every glyph is exactly half the font size wide.
const monoMeasure: MeasureText = (text, css) => {
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(css)?.[1] ?? '16');
  return text.length * (size / 2);
};

const olfFile = async (
  content: unknown,
  name = 'Lesson.olf'
): Promise<File> => {
  const zip = new JSZip();
  zip.file('content.json', JSON.stringify(content));
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name);
};

const readBundle = async (
  blob: Blob
): Promise<{ zip: JSZip; manifest: Record<string, unknown> }> => {
  const zip = await new JSZip().loadAsync(blob);
  const entry = zip.file('manifest.json');
  if (!entry) throw new Error('bundle missing manifest.json');
  const manifest = JSON.parse(await entry.async('string')) as Record<
    string,
    unknown
  >;
  return { zip, manifest };
};

const pageSvg = async (zip: JSZip, index = 0): Promise<string> => {
  const entry = zip.file(`pages/${index}.svg`);
  if (!entry) throw new Error(`bundle missing pages/${index}.svg`);
  return entry.async('string');
};

const run = (text: string, extra: Record<string, unknown> = {}) => ({
  text: {
    id: `run-${text.slice(0, 4)}`,
    text,
    'font-size': 30,
    'font-family': 'Segoe UI',
    'font-weight': 'normal',
    'font-style': 'normal',
    'text-decoration': 'normal',
    fill: '#FF000000',
    background: '#FFFFFFFF',
    'background-opacity': 1,
    'fill-opacity': 1,
    ...extra,
  },
});

const paragraph = (runs: unknown[], id = 'p') => ({
  paragraph: { id, 'font-size': 30, 'text-list-container': runs },
});

const page = (elements: unknown[], extra: Record<string, unknown> = {}) => ({
  page: {
    id: 'page-1',
    matrix: '1,0,0,0,1,0,0,0,1',
    viewbox: '0,0,1920,1080',
    'is-hidden': false,
    elements,
    backgrounds: [
      { background: { id: 'bg', opacity: 1, type: 'color', fill: '#FFFFFF' } },
    ],
    ...extra,
  },
});

const doc = (pages: unknown[], extra: Record<string, unknown> = {}) => ({
  olf: {
    width: 1920,
    height: 1080,
    viewbox: '0 0 1920 1080',
    pageset: pages,
    additional: [],
    links: [],
    groups: [],
    ...extra,
  },
});

describe('isOlfFile', () => {
  it('matches .olf case-insensitively', () => {
    expect(isOlfFile('a.olf')).toBe(true);
    expect(isOlfFile('A.OLF')).toBe(true);
    expect(isOlfFile('a.notebook')).toBe(false);
  });
});

describe('splitArgb', () => {
  it('splits ARGB into hex and opacity', () => {
    expect(splitArgb('#FF000000')).toEqual({ hex: '#000000', opacity: 1 });
    expect(splitArgb('#80FF0000')?.hex).toBe('#ff0000');
    expect(splitArgb('#80FF0000')?.opacity).toBeCloseTo(128 / 255, 5);
    expect(splitArgb('#FFFFFF')).toEqual({ hex: '#ffffff', opacity: 1 });
    expect(splitArgb('nope')).toBeNull();
  });
});

describe('matrixToSvg', () => {
  it('returns null for identity', () => {
    expect(matrixToSvg('1,0,0,0,1,0,0,0,1')).toBeNull();
  });

  it('maps 3x3 row-major to SVG 2x3 column order', () => {
    expect(matrixToSvg('2,0,10,0,3,20,0,0,1')).toBe('matrix(2 0 0 3 10 20)');
  });
});

describe('repairEncoding', () => {
  it('repairs latin1-decoded UTF-8', () => {
    expect(repairEncoding('AusdrÃ¼cke')).toBe('Ausdrücke');
  });

  it('leaves already-correct text alone', () => {
    expect(repairEncoding('Ausdrücke')).toBe('Ausdrücke');
  });
});

describe('parseRtf', () => {
  const RTF =
    '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fnil Segoe UI;}}\r\n' +
    '{\\colortbl ;\\red0\\green0\\blue0;}\r\n{\\*\\generator Riched20}\\viewkind4\\uc1 \r\n' +
    "\\pard\\sl-585\\slmult0\\f0\\fs45 der W\\'fcrfel\\tab zwei\\par\r\n" +
    '\\u8364?uro\\par\r\n}';

  it('decodes hex, unicode and tab escapes and drops header tables', () => {
    const info = parseRtf(RTF);
    expect(info.paragraphs[0]).toContain('der Würfel');
    expect(info.paragraphs[0]).toContain('\tzwei');
    expect(info.paragraphs[0]).not.toContain('Segoe UI;');
    expect(info.paragraphs[1]).toBe('€uro');
  });

  it('reads exact line spacing from \\sl', () => {
    // 585 twips = 29.25pt = 39px at 96dpi.
    expect(parseRtf(RTF).lineHeightPx).toBeCloseTo(39, 5);
  });

  it('reads explicit tab stops from \\tx', () => {
    expect(parseRtf('\\pard\\tx1440\\tx2880 a\\par').tabStopsPx).toEqual([
      96, 192,
    ]);
  });
});

describe('convertOlfToBundle', () => {
  it('writes page size, viewBox and a full-bleed background rect', async () => {
    const result = await convertOlfToBundle(await olfFile(doc([page([])])), {
      measureText: monoMeasure,
    });
    const { zip, manifest } = await readBundle(result.blob);
    expect(result.title).toBe('Lesson');
    expect(result.pageCount).toBe(1);
    expect(manifest.pages).toEqual([
      { file: 'pages/0.svg', width: 1920, height: 1080 },
    ]);
    const svg = await pageSvg(zip);
    expect(svg).toContain('width="1920"');
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg).toContain(
      '<g class="background"><rect x="0" y="0" width="1920" height="1080" fill="#ffffff"/></g>'
    );
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('maps a polygon with stroke and fill settings', async () => {
    const content = doc([
      page([
        {
          polygon: {
            id: 'poly-1',
            points: '70,121 1798,121 1798,264',
            'stroke-width': 6,
            stroke: '#000000',
            fill: '#FFFFFF',
            'fill-opacity': 0,
            'stroke-opacity': 1,
            matrix: '1,0,0,0,1,0,0,0,1',
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg).toContain('<polygon points="70,121 1798,121 1798,264"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain('stroke-width="6"');
    expect(svg).toContain('fill="none"');
  });

  it('positions one text element per paragraph, empty ones advancing the offset', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-1',
            x: 100,
            y: 200,
            width: 400,
            height: 120,
            'custom-data': '',
            matrix: '1,0,0,0,1,0,0,0,1',
            'text-blocks-container': [
              paragraph([run('one')], 'p1'),
              { paragraph: { id: 'p2', 'font-size': 30 } },
              paragraph([run('three')], 'p3'),
            ],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    // Line height defaults to font-size * 1.3 = 39; baseline = top + 0.8em.
    expect(svg).toContain('y="224"'); // 200 + 0 + 24
    expect(svg).toContain('y="302"'); // 200 + 78 + 24
    expect(svg).not.toContain('y="263"'); // the empty paragraph emits nothing
    expect(svg).toContain('xml:space="preserve"');
    expect(svg.match(/<text/g)).toHaveLength(2);
  });

  it('splits tabs into tspan cells snapped to 48px tab stops', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-tab',
            x: 0,
            y: 0,
            width: 800,
            height: 60,
            'custom-data': '',
            'text-blocks-container': [paragraph([run('ab\tcd\t\tef')])],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    // "ab" at 30px mono = 30 wide -> next stop 48. "cd" ends at 78 -> 96, then 144.
    const xs = Array.from(svg.matchAll(/<tspan x="([\d.]+)"/g)).map(
      (m) => m[1]
    );
    expect(xs).toEqual(['0', '48', '144']);
    expect(svg).toContain('>ab</tspan>');
    expect(svg).toContain('>ef</tspan>');
  });

  it('repairs mojibake in the JSON text', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-moji',
            x: 0,
            y: 0,
            width: 400,
            height: 40,
            'custom-data': '',
            'text-blocks-container': [paragraph([run('AusdrÃ¼cke')])],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    expect(await pageSvg(zip)).toContain('>Ausdrücke</tspan>');
  });

  it('falls back to the RTF custom-data when the JSON text is unrecoverable', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-rtf',
            x: 0,
            y: 0,
            width: 400,
            height: 40,
            'custom-data':
              "{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0\\fnil Segoe UI;}}\\pard\\f0\\fs45 der W\\'fcrfel\\par}",
            'text-blocks-container': [paragraph([run('der W\uFFFDrfel')])],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    expect(await pageSvg(zip)).toContain('>der Würfel</tspan>');
    expect(result.skipped['text-encoding-repaired-from-rtf']).toBe(1);
  });

  it('splits ARGB run fills into fill + fill-opacity', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-color',
            x: 0,
            y: 0,
            width: 400,
            height: 40,
            'text-blocks-container': [
              paragraph([run('hi', { fill: '#80FF0000' })]),
            ],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-opacity="0.5"');
  });

  it('records hidden page indices in the manifest but still exports them', async () => {
    const content = doc([
      page([], { id: 'p0' }),
      page([], { id: 'p1', 'is-hidden': true }),
      page([], { id: 'p2' }),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { manifest } = await readBundle(result.blob);
    expect(result.pageCount).toBe(3);
    expect(result.hiddenPageCount).toBe(1);
    expect(manifest.hiddenPages).toEqual([1]);
  });

  it('counts unknown element types in skipped instead of throwing', async () => {
    const content = doc([
      page([{ hologram: { id: 'h1' } }, { hologram: { id: 'h2' } }]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    expect(result.skipped.hologram).toBe(2);
    expect(result.pageCount).toBe(1);
  });

  it('carries locked flags and flip from the additional list', async () => {
    const content = doc(
      [
        page([
          {
            polygon: {
              id: 'poly-1',
              points: '0,0 10,0 10,10',
              stroke: '#000000',
              x: 0,
              y: 0,
              width: 10,
              height: 10,
            },
          },
        ]),
      ],
      {
        additional: [
          {
            element: {
              id: 'a1',
              ref: 'poly-1',
              'is-locked': true,
              'is-moveable-locked': true,
              flip: 'horizontal',
            },
          },
        ],
      }
    );
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg).toContain('data-olf-locked="true"');
    expect(svg).toContain('data-olf-move-locked="true"');
    expect(svg).toContain('translate(10 0) scale(-1 1)');
  });

  it('applies non-identity element and page matrices as SVG transforms', async () => {
    const content = doc([
      page(
        [
          {
            polygon: {
              id: 'poly-1',
              points: '0,0 10,0',
              stroke: '#000000',
              matrix: '1,0,5,0,1,7,0,0,1',
            },
          },
        ],
        { matrix: '2,0,0,0,2,0,0,0,1' }
      ),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg).toContain(
      '<g class="foreground" transform="matrix(2 0 0 2 0 0)">'
    );
    expect(svg).toContain('transform="matrix(1 0 0 1 5 7)"');
  });

  it('produces a bundle that parseNotebookFile can read back', async () => {
    const result = await convertOlfToBundle(await olfFile(doc([page([])])), {
      measureText: monoMeasure,
    });
    const parsed = await parseNotebookFile(
      new File([result.blob], 'Lesson.spartnb')
    );
    expect(parsed.title).toBe('Lesson');
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].extension).toBe('svg');
  });
});

describe('convertOlfToBundle against the real sample', () => {
  const exists = fs.existsSync(SAMPLE_PATH);

  it.runIf(exists)(
    'converts sample.olf with the expected object mix',
    async () => {
      const bytes = fs.readFileSync(SAMPLE_PATH);
      const file = new File([new Uint8Array(bytes)], 'sample.olf');
      const result = await convertOlfToBundle(file, {
        measureText: monoMeasure,
      });

      expect(result.pageCount).toBe(1);
      expect(result.hiddenPageCount).toBe(0);
      const { zip, manifest } = await readBundle(result.blob);
      expect(manifest.pages).toEqual([
        { file: 'pages/0.svg', width: 1920, height: 1080 },
      ]);

      const svg = await pageSvg(zip);
      // 3 textareas -> 1 + 3 + 5 paragraphs, of which 2 are empty spacers.
      expect(svg.match(/data-olf-id="9bbae995/g)).toHaveLength(1);
      expect(svg.match(/data-olf-id="4bc0c20d/g)).toHaveLength(3);
      expect(svg.match(/data-olf-id="dd677dd0/g)).toHaveLength(3);
      expect(svg.match(/<polygon /g)).toHaveLength(1);
      expect(svg).toContain('Ordnen Sie die Ausdrücke ein.');
      expect(result.skipped).toEqual({});
    }
  );
});
