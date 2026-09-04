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

// Local-only fixtures; every test that reads them is guarded by existsSync.
const SAMPLE_PATHS = [
  'C:\\Users\\PAUL~1.IVE\\AppData\\Local\\Temp\\claude\\C--Users-paul-ivers-Desktop-Code-SpartBoard--claude-worktrees-spartboard-realtime-sync-ee34e1\\037b0c15-7e63-4766-a7ef-cb86131dc6cc\\scratchpad\\olf\\sample.olf',
  'C:\\Users\\paul.ivers\\Desktop\\delete later\\Spielmaterialien, Spielaktivitäten, Spielarten.olf',
];
const SAMPLE_PATH = SAMPLE_PATHS.find((p) => fs.existsSync(p)) ?? '';

// Monospace stub: every glyph is exactly half the font size wide.
const monoMeasure: MeasureText = (text, css) => {
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(css)?.[1] ?? '16');
  return text.length * (size / 2);
};

type Mat6 = [number, number, number, number, number, number];

const mul6 = (a: Mat6, b: Mat6): Mat6 => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Collapses an SVG transform list into one matrix. */
const parseTransform = (value: string): Mat6 => {
  let out: Mat6 = [1, 0, 0, 1, 0, 0];
  for (const m of value.matchAll(/(translate|matrix|scale)\(([^)]*)\)/g)) {
    const n = m[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const step: Mat6 =
      m[1] === 'translate'
        ? [1, 0, 0, 1, n[0], n[1] ?? 0]
        : m[1] === 'scale'
          ? [n[0], 0, 0, n[1] ?? n[0], 0, 0]
          : [n[0], n[1], n[2], n[3], n[4], n[5]];
    out = mul6(out, step);
  }
  return out;
};

const applyTransform = (m: Mat6, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const scaleOf = (m: Mat6): number => Math.hypot(m[0], m[1]);

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

  it('splits tabs into separate text objects snapped to 48px tab stops', async () => {
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
    // Each cell is its own draggable object now.
    expect(svg.match(/<text/g)).toHaveLength(3);
    expect(svg.match(/<text[^>]* x="0"/g)).toHaveLength(1);
    expect(svg.match(/<text[^>]* x="48"/g)).toHaveLength(1);
    expect(svg.match(/<text[^>]* x="144"/g)).toHaveLength(1);
    expect(svg.match(/data-olf-id="ta-tab-p0-c\d+"/g)).toHaveLength(3);
    // Font attributes repeat on every element — there is no shared parent.
    expect(svg.match(/<text[^>]*font-size="30"/g)).toHaveLength(3);
    expect(svg.match(/<text[^>]*xml:space="preserve"/g)).toHaveLength(3);
  });

  it('treats a run of 3+ spaces as a column break but keeps shorter runs', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-gap',
            x: 0,
            y: 0,
            width: 800,
            height: 60,
            'custom-data': '',
            'text-blocks-container': [paragraph([run('ab cd    ef')])],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg.match(/<text/g)).toHaveLength(2);
    expect(svg).toContain('>ab cd</tspan>');
    expect(svg).toContain('>ef</tspan>');
    // "ab cd" is 5 glyphs = 75px, plus 4 consumed spaces = 60px.
    const xs = Array.from(svg.matchAll(/<tspan x="([\d.]+)"/g)).map(
      (m) => m[1]
    );
    expect(xs).toEqual(['0', '135']);
  });

  it('trims a cell and advances its x past the dropped leading spaces', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-trim',
            x: 0,
            y: 0,
            width: 800,
            height: 60,
            'custom-data': '',
            'text-blocks-container': [paragraph([run('ab\t  cd  ')])],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg).toContain('>cd</tspan>');
    expect(svg).not.toContain('>  cd  </tspan>');
    // Tab stop 48 plus the two 15px spaces that were trimmed away.
    const xs = Array.from(svg.matchAll(/<tspan x="([\d.]+)"/g)).map(
      (m) => m[1]
    );
    expect(xs).toEqual(['0', '78']);
  });

  it('leaves a paragraph without column breaks as a single object', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-one',
            x: 5,
            y: 0,
            width: 800,
            height: 60,
            'custom-data': '',
            'text-blocks-container': [paragraph([run('ab cd')], 'p0')],
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg.match(/<text/g)).toHaveLength(1);
    expect(svg).toContain('data-olf-id="ta-one-p0"');
    expect(svg).not.toContain('-p0-c');
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

  it('ignores the page camera matrix but keeps element matrices', async () => {
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
        { matrix: '1.7,0,-580,0,1.7,-215,0,0,1' }
      ),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg).toContain('<g class="foreground">');
    expect(svg).not.toContain('class="foreground" transform');
    expect(svg).toContain('<polygon points="0,0 10,0"');
    expect(svg).toContain('transform="matrix(1 0 0 1 5 7)"');
  });

  it('grows the page viewBox to cover content outside the declared page', async () => {
    const content = doc([
      page([
        {
          image: {
            id: 'img-1',
            x: 1800,
            y: -100,
            width: 300,
            height: 200,
            href: 'data:image/png;base64,iVBORw0KGgo=',
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip, manifest } = await readBundle(result.blob);
    expect(manifest.pages).toEqual([
      { file: 'pages/0.svg', width: 2124, height: 1204 },
    ]);
    const svg = await pageSvg(zip);
    expect(svg).toContain('viewBox="0 -124 2124 1204"');
    expect(svg).toContain('width="2124"');
    expect(svg).toContain('height="1204"');
    expect(svg).toContain(
      '<rect x="0" y="-124" width="2124" height="1204" fill="#ffffff"/>'
    );
  });

  it('grows the viewBox using an element matrix translation', async () => {
    const content = doc([
      page([
        {
          image: {
            id: 'img-1',
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            matrix: '1,0,1900,0,1,0,0,0,1',
            href: 'data:image/png;base64,iVBORw0KGgo=',
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip, manifest } = await readBundle(result.blob);
    expect(manifest.pages).toEqual([
      { file: 'pages/0.svg', width: 2124, height: 1080 },
    ]);
    expect(await pageSvg(zip)).toContain('viewBox="0 0 2124 1080"');
  });

  it('leaves the viewBox alone when content fits the page', async () => {
    const content = doc([
      page([
        {
          image: {
            id: 'img-1',
            x: 100,
            y: 100,
            width: 300,
            height: 200,
            href: 'data:image/png;base64,iVBORw0KGgo=',
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip, manifest } = await readBundle(result.blob);
    expect(manifest.pages).toEqual([
      { file: 'pages/0.svg', width: 1920, height: 1080 },
    ]);
    expect(await pageSvg(zip)).toContain('viewBox="0 0 1920 1080"');
  });

  it('emits nothing for empty textareas and leaves the viewBox alone', async () => {
    const content = doc([
      page([
        {
          textarea: {
            id: 'ta-empty-1',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            'custom-data': '',
            'text-blocks-container': [paragraph([run('')], 'p1')],
          },
        },
        {
          textarea: {
            id: 'ta-empty-2',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            'custom-data': '',
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { zip } = await readBundle(result.blob);
    const svg = await pageSvg(zip);
    expect(svg).toContain('<g class="foreground"></g>');
    expect(svg).toContain('viewBox="0 0 1920 1080"');
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

describe('box element placement', () => {
  const svgFor = async (element: unknown): Promise<string> => {
    const file = await olfFile(doc([page([element])]));
    const result = await convertOlfToBundle(file, { measureText: monoMeasure });
    return pageSvg((await readBundle(result.blob)).zip);
  };

  const tagOf = (svg: string, re: RegExp): string => re.exec(svg)?.[0] ?? '';
  const attrOf = (tag: string, name: string): string =>
    new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? '';

  it('offsets a scaled image by x/y after its matrix', async () => {
    const svg = await svgFor({
      image: {
        id: 'img-1',
        x: 1538.2,
        y: 517.3,
        width: 300,
        height: 300,
        matrix: '0.6,0,-573.4,0,0.6,-342.7,0,0,1',
        href: 'data:image/png;base64,iVBORw0KGgo=',
      },
    });
    const tag = tagOf(svg, /<image [^>]*\/>/);
    expect(attrOf(tag, 'x')).toBe('0');
    expect(attrOf(tag, 'y')).toBe('0');
    const m = parseTransform(attrOf(tag, 'transform'));
    const [x, y] = applyTransform(m, 0, 0);
    expect(x).toBeCloseTo(964.8, 2);
    expect(y).toBeCloseTo(174.6, 2);
    expect(300 * scaleOf(m)).toBeCloseTo(180, 2);
  });

  it('scales a textarea through its transform, not its font-size', async () => {
    const svg = await svgFor({
      textarea: {
        id: 'ta-1',
        x: 901.5,
        y: 95.2,
        width: 460,
        height: 29,
        'custom-data': '',
        matrix: '1.7,0,0,0,1.7,0,0,0,1',
        'text-blocks-container': [paragraph([run('Bleistift')], 'p0')],
      },
    });
    const tag = tagOf(svg, /<text [^>]*>/);
    expect(attrOf(tag, 'x')).toBe('0');
    expect(attrOf(tag, 'font-size')).toBe('30');
    const m = parseTransform(attrOf(tag, 'transform'));
    expect(scaleOf(m)).toBeCloseTo(1.7, 6);
    const [x, y] = applyTransform(m, 0, Number(attrOf(tag, 'y')));
    expect(x).toBeCloseTo(901.5, 2);
    // Baseline is local (0.8em), so it scales with the paragraph.
    expect(y).toBeCloseTo(95.2 + 24 * 1.7, 2);
  });

  it('rotates a textarea about its local origin then offsets it', async () => {
    const svg = await svgFor({
      textarea: {
        id: 'ta-rot',
        x: 30,
        y: 620,
        width: 132,
        height: 75,
        'custom-data': '',
        matrix: '0,1.7,0,-1.7,0,0,0,0,1',
        'text-blocks-container': [paragraph([run('door')], 'p0')],
      },
    });
    const m = parseTransform(attrOf(tagOf(svg, /<text [^>]*>/), 'transform'));
    // A local point one unit right of the origin rotates to one unit up.
    const [x, y] = applyTransform(m, 1, 0);
    expect(x).toBeCloseTo(30, 6);
    expect(y).toBeCloseTo(620 - 1.7, 6);
  });

  it('keeps ellipse cx/cy local and offsets them by x/y', async () => {
    const svg = await svgFor({
      ellipse: {
        id: 'el-1',
        x: 200,
        y: 300,
        width: 374,
        height: 398,
        cx: 117,
        cy: 117,
        rx: 117,
        ry: 117,
        stroke: '#0000FF',
        'stroke-width': 3,
        matrix: '2,0,0,0,2,0,0,0,1',
      },
    });
    const tag = tagOf(svg, /<ellipse [^>]*\/>/);
    expect(attrOf(tag, 'cx')).toBe('117');
    expect(attrOf(tag, 'cy')).toBe('117');
    const [x, y] = applyTransform(
      parseTransform(attrOf(tag, 'transform')),
      117,
      117
    );
    expect(x).toBeCloseTo(434, 6);
    expect(y).toBeCloseTo(534, 6);
  });

  it('grows the page using translate(x,y) * matrix, not matrix alone', async () => {
    // The old rule put this at 100*2+1900 = 2100; the correct one at 1900+200.
    const content = doc([
      page([
        {
          image: {
            id: 'img-1',
            x: 1900,
            y: 100,
            width: 100,
            height: 100,
            matrix: '2,0,0,0,2,0,0,0,1',
            href: 'data:image/png;base64,iVBORw0KGgo=',
          },
        },
      ]),
    ]);
    const result = await convertOlfToBundle(await olfFile(content), {
      measureText: monoMeasure,
    });
    const { manifest } = await readBundle(result.blob);
    expect(manifest.pages).toEqual([
      { file: 'pages/0.svg', width: 2124, height: 1080 },
    ]);
  });
});

describe('convertOlfToBundle against the real sample', () => {
  const exists = SAMPLE_PATH !== '';

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
      // The heading has no column breaks, so it stays one object.
      expect(svg.match(/data-olf-id="9bbae995/g)).toHaveLength(1);
      // The vocabulary grid's three rows split into 5 + 5 + 4 cells.
      expect(svg.match(/data-olf-id="4bc0c20d/g)).toHaveLength(14);
      expect(svg.match(/data-olf-id="4bc0c20d[^"]*-p0-c\d+"/g)).toHaveLength(5);
      expect(svg.match(/data-olf-id="4bc0c20d[^"]*-p1-c\d+"/g)).toHaveLength(5);
      expect(svg.match(/data-olf-id="4bc0c20d[^"]*-p2-c\d+"/g)).toHaveLength(4);
      expect(svg).toContain('>das Spielbrett</tspan>');
      expect(svg).toContain('>eine Runde aussetzen</tspan>');
      // The row-label column has one object per non-empty paragraph.
      expect(svg.match(/data-olf-id="dd677dd0/g)).toHaveLength(3);
      expect(svg.match(/<polygon /g)).toHaveLength(1);
      expect(svg).toContain('Ordnen Sie die Ausdrücke ein.');
      expect(result.skipped).toEqual({});
    }
  );
});

describe('paragraph object identity', () => {
  const textarea = (paragraphs: unknown[]) => ({
    textarea: {
      id: 'ta-1',
      x: 10,
      y: 20,
      width: 400,
      height: 200,
      matrix: '1,0,0,0,1,0,0,0,1',
      'custom-data': '',
      'text-blocks-container': paragraphs,
    },
  });

  const svgFor = async (paragraphs: unknown[]): Promise<string> => {
    const file = await olfFile(doc([page([textarea(paragraphs)])]));
    const result = await convertOlfToBundle(file, {
      measureText: monoMeasure,
    });
    return pageSvg((await readBundle(result.blob)).zip);
  };

  it('gives every paragraph of one textarea a unique id', async () => {
    const svg = await svgFor([
      paragraph([run('One')], 'p0'),
      paragraph([run('Two')], 'p1'),
    ]);
    expect(svg).toContain('data-olf-id="ta-1-p0"');
    expect(svg).toContain('data-olf-id="ta-1-p1"');
    expect(svg.match(/data-olf-id="ta-1-p\d+"/g)).toHaveLength(2);
  });

  it('wraps highlight rects and their text in one group', async () => {
    const svg = await svgFor([
      paragraph(
        [run('Lit', { background: '#FFFFFF00', 'background-opacity': 1 })],
        'p0'
      ),
    ]);
    expect(svg).toContain('<g data-olf-id="ta-1-p0"><rect');
    expect(svg).toMatch(/<g data-olf-id="ta-1-p0">.*<\/text><\/g>/);
    // The id lives on the group, not on the text inside it.
    expect(svg.match(/data-olf-id="ta-1-p0"/g)).toHaveLength(1);
  });

  it('wraps each highlighted cell in its own group', async () => {
    const svg = await svgFor([
      paragraph(
        [run('Lit\tUp', { background: '#FFFFFF00', 'background-opacity': 1 })],
        'p0'
      ),
    ]);
    expect(svg.match(/<g data-olf-id="ta-1-p0-c\d+"><rect/g)).toHaveLength(2);
    expect(svg).toContain('>Lit</tspan>');
    expect(svg).toContain('>Up</tspan>');
  });

  it('keeps runs with different highlight colors as separate cells', async () => {
    const svg = await svgFor([
      paragraph(
        [
          run('Red', { background: '#FFFF0000', 'background-opacity': 1 }),
          run('Blue', { background: '#FF0000FF', 'background-opacity': 1 }),
        ],
        'p0'
      ),
    ]);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill="#0000ff"');
    expect(svg.match(/<tspan/g)).toHaveLength(2);
  });

  it('emits a bare text element when there are no highlights', async () => {
    const svg = await svgFor([paragraph([run('Plain')], 'p0')]);
    expect(svg).not.toContain('<g data-olf-id=');
    expect(svg).toContain('data-olf-id="ta-1-p0"');
  });
});

describe('convertOlfToBundle images, ink and shapes', () => {
  // 1x1 transparent PNG, the same fixture the SMART converter tests use.
  const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const olfWithImages = async (
    content: unknown,
    files: Record<string, string>
  ): Promise<File> => {
    const zip = new JSZip();
    zip.file('content.json', JSON.stringify(content));
    for (const [name, base64] of Object.entries(files)) {
      zip.file(name, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], 'Lesson.olf');
  };

  const stubUri = (bytes: Uint8Array): Promise<string> =>
    Promise.resolve(`data:image/webp;base64,STUB${bytes.byteLength}`);

  const image = (source: string, extra: Record<string, unknown> = {}) => ({
    image: {
      id: `img-${source}`,
      x: 10,
      y: 20,
      width: 300,
      height: 300,
      source,
      'mime-type': 'image/png',
      matrix: '2,0,5,0,2,7,0,0,1',
      ...extra,
    },
  });

  it('inlines a zip image as an optimized data URI with its matrix', async () => {
    const file = await olfWithImages(doc([page([image('images/a.png')])]), {
      'images/a.png': PNG_BASE64,
    });
    const result = await convertOlfToBundle(file, {
      measureText: monoMeasure,
      optimizeImage: stubUri,
    });
    const svg = await pageSvg((await readBundle(result.blob)).zip);
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/webp;base64,STUB');
    expect(svg).toContain('width="300"');
    expect(svg).toContain('transform="translate(10 20) matrix(2 0 0 2 5 7)"');
    expect(svg).toContain('<image href="data:image/webp;base64,STUB70" x="0"');
    expect(result.skipped).toEqual({});
  });

  it('optimizes a source shared by two pages only once', async () => {
    const calls: string[] = [];
    const file = await olfWithImages(
      doc([page([image('images/a.png')]), page([image('images/a.png')])]),
      { 'images/a.png': PNG_BASE64 }
    );
    const result = await convertOlfToBundle(file, {
      measureText: monoMeasure,
      optimizeImage: async (bytes, mime) => {
        calls.push(mime);
        return stubUri(bytes);
      },
    });
    expect(calls).toEqual(['image/png']);
    expect(result.pageCount).toBe(2);
  });

  it('resolves a source case-insensitively and by basename', async () => {
    const file = await olfWithImages(
      doc([page([image('Images/A.PNG'), image('a.png')])]),
      { 'images/a.png': PNG_BASE64 }
    );
    const result = await convertOlfToBundle(file, {
      measureText: monoMeasure,
      optimizeImage: stubUri,
    });
    const svg = await pageSvg((await readBundle(result.blob)).zip);
    expect(svg.match(/<image/g)).toHaveLength(2);
    expect(result.skipped).toEqual({});
  });

  it('counts an image whose source is missing from the zip', async () => {
    const file = await olfWithImages(
      doc([page([image('images/gone.png')])]),
      {}
    );
    const result = await convertOlfToBundle(file, {
      measureText: monoMeasure,
      optimizeImage: stubUri,
    });
    expect(result.skipped).toEqual({ 'image-missing': 1 });
  });

  const stroke = (extra: Record<string, unknown> = {}) => ({
    stroke: {
      id: 'ink-1',
      points: '10,10 10,10 10,10 20,20 20,20 30.005,30.004',
      stroke: '#FF0000',
      'pen-width': 3.5294117647058822,
      'pen-height': 3.5294117647058822,
      opacity: 1,
      'is-highlighter': false,
      'pen-type': 'pen',
      'stylus-tip-transform': '1.7,0,0,0,1.7,0,0,0,1',
      matrix: '1,0,0,0,1,0,0,0,1',
      ...extra,
    },
  });

  const shapeSvg = async (element: unknown): Promise<string> => {
    const file = await olfFile(doc([page([element])]));
    const result = await convertOlfToBundle(file, { measureText: monoMeasure });
    return pageSvg((await readBundle(result.blob)).zip);
  };

  it('renders a pen stroke as a deduped polyline scaled by the stylus tip', async () => {
    const svg = await shapeSvg(stroke());
    expect(svg).toContain('points="10,10 20,20 30.01,30"');
    expect(svg).toContain('stroke-width="6"');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('data-olf-id="ink-1"');
  });

  it('renders a highlighter stroke at reduced opacity with square caps', async () => {
    const svg = await shapeSvg(
      stroke({ 'is-highlighter': true, opacity: 0.5 })
    );
    expect(svg).toContain('stroke-opacity="0.2"');
    expect(svg).toContain('stroke-linecap="butt"');
  });

  it('classifies a pen stroke as ink for the editor', async () => {
    // notebookSvgEdit treats <polyline> as ink, so the eraser tool can hit it.
    expect(await shapeSvg(stroke())).toMatch(
      /<polyline[^>]*data-olf-id="ink-1"/
    );
  });

  it('counts a stroke with no usable points', async () => {
    const file = await olfFile(doc([page([stroke({ points: '' })])]));
    const result = await convertOlfToBundle(file, { measureText: monoMeasure });
    expect(result.skipped).toEqual({ stroke: 1 });
  });

  const ellipse = (extra: Record<string, unknown> = {}) => ({
    ellipse: {
      id: 'el-1',
      x: 0,
      y: 0,
      width: 374.15,
      height: 398.09,
      cx: 117.08,
      cy: 117.08,
      rx: 117.08,
      ry: 117.08,
      'is-pie': false,
      'angle-start': 0,
      'angle-end': 359.9,
      stroke: '#0000FF',
      'stroke-width': 3,
      fill: '#FFFFFF',
      'fill-opacity': 0,
      'stroke-opacity': 1,
      boundary: '1 2 3 4',
      matrix: '1,0,0,0,1,0,0,0,1',
      ...extra,
    },
  });

  it('prefers cx/cy/rx/ry over the bounding box', async () => {
    const svg = await shapeSvg(ellipse());
    expect(svg).toContain(
      '<ellipse cx="117.08" cy="117.08" rx="117.08" ry="117.08"'
    );
    expect(svg).toContain('fill="none"');
    expect(svg).not.toContain('boundary=');
  });

  it('renders a partial pie as an arc wedge path', async () => {
    const svg = await shapeSvg(
      ellipse({ 'is-pie': true, 'angle-start': 0, 'angle-end': 90 })
    );
    expect(svg).toContain(
      '<path d="M 117.08 117.08 L 234.16 117.08 A 117.08 117.08 0 0 1 117.08 234.16 Z"'
    );
    expect(svg).not.toContain('<ellipse');
  });

  it('renders a full-sweep pie as a plain ellipse', async () => {
    expect(await shapeSvg(ellipse({ 'is-pie': true }))).toContain('<ellipse');
  });

  const arrow = (id: string, hex: string) => ({
    polyline: {
      id,
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      points: '10,10 90,10',
      stroke: hex,
      'stroke-width': 6,
      'stroke-opacity': 1,
      'stroke-linecap': 'round',
      'lineshape-start': 'normal',
      'lineshape-end': 'arrow',
      matrix: '1,0,0,0,1,0,0,0,1',
    },
  });

  it('emits one arrow marker per colour and references it', async () => {
    const svg = await shapeSvg(arrow('a1', '#000000'));
    expect(svg).toContain('<defs><marker id="olf-arrow-000000"');
    expect(svg).toContain('marker-end="url(#olf-arrow-000000)"');
    expect(svg).not.toContain('marker-start=');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it('reuses one marker def for two arrows of the same colour', async () => {
    const file = await olfFile(
      doc([page([arrow('a1', '#000000'), arrow('a2', '#000000')])])
    );
    const result = await convertOlfToBundle(file, { measureText: monoMeasure });
    const svg = await pageSvg((await readBundle(result.blob)).zip);
    expect(svg.match(/<marker /g)).toHaveLength(1);
    expect(svg.match(/marker-end=/g)).toHaveLength(2);
  });
});

describe('convertOlfToBundle real .olf samples', () => {
  const SCRATCH =
    'C:\\Users\\PAUL~1.IVE\\AppData\\Local\\Temp\\claude\\C--Users-paul-ivers-Desktop-Code-SpartBoard--claude-worktrees-spartboard-realtime-sync-ee34e1\\bef16118-50ef-4aee-91b4-3824c2f685ec\\scratchpad\\olf\\';

  const convertSample = async (
    name: string
  ): Promise<{
    result: Awaited<ReturnType<typeof convertOlfToBundle>>;
    svg: string;
    svgs: string[];
  }> => {
    const bytes = fs.readFileSync(`${SCRATCH}${name}`);
    const file = new File([new Uint8Array(bytes)], name);
    const result = await convertOlfToBundle(file, {
      measureText: monoMeasure,
      optimizeImage: (b) =>
        Promise.resolve(`data:image/webp;base64,STUB${b.byteLength}`),
    });
    const { zip } = await readBundle(result.blob);
    const svgs: string[] = [];
    for (let i = 0; i < result.pageCount; i++) svgs.push(await pageSvg(zip, i));
    return { result, svg: svgs.join(''), svgs };
  };

  const countOf = (svg: string, re: RegExp): number =>
    svg.match(re)?.length ?? 0;

  it.skipIf(!fs.existsSync(`${SCRATCH}seating.olf`))(
    'converts seating.olf with nothing skipped',
    async () => {
      const { result, svg, svgs } = await convertSample('seating.olf');
      expect(result.pageCount).toBe(4);
      expect(result.skipped).toEqual({});
      expect(countOf(svg, /<image /g)).toBe(14);
      expect(countOf(svg, /<polyline /g)).toBe(13);
      // The camera matrix is ignored, so no page carries a foreground transform.
      expect(countOf(svg, /class="foreground" transform/g)).toBe(0);
      const box = (page: number): number[] =>
        (
          /viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/
            .exec(svgs[page])
            ?.slice(1) ?? []
        ).map(Number);
      // Page 1 stays anchored at the page origin but overflows to the right.
      expect(box(1).slice(0, 2)).toEqual([0, 0]);
      expect(box(1)[2]).toBeGreaterThan(1920);
      expect(box(1)[3]).toBe(1080);
      // Pages 0 and 2 now land inside the declared page; page 3 still overflows.
      expect(box(0)).toEqual([0, 0, 1920, 1080]);
      expect(box(2)).toEqual([0, 0, 1920, 1080]);
      expect(box(3)[0]).toBeLessThan(0);
      expect(box(3)[1]).toBeLessThan(0);
    }
  );

  it.skipIf(!fs.existsSync(`${SCRATCH}seating.olf`))(
    'places seating.olf page 2 boxes at translate(x,y) * matrix * local',
    async () => {
      const { svgs } = await convertSample('seating.olf');
      const svg = svgs[2];

      const attrOf = (tag: string, name: string): string =>
        new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? '';

      const images = Array.from(svg.matchAll(/<image [^>]*\/>/g)).map(
        (m) => m[0]
      );
      expect(images).toHaveLength(4);

      // "phone in pocket chart", "smartwatch in backpack", "pencil on desk",
      // "backpacks in front", in document order.
      const expected: [number, number, number][] = [
        [1391.2, 508.3, 271.1],
        [940.9, 514.2, 242.4],
        [964.8, 174.6, 180],
        [1382.1, 134.7, 278.7],
      ];
      images.forEach((tag, index) => {
        const [x, y, size] = expected[index];
        expect(Number(attrOf(tag, 'x'))).toBe(0);
        expect(Number(attrOf(tag, 'y'))).toBe(0);
        expect(Number(attrOf(tag, 'width'))).toBe(300);
        const t = parseTransform(attrOf(tag, 'transform'));
        const [rx, ry] = applyTransform(t, 0, 0);
        expect(Math.abs(rx - x)).toBeLessThan(0.5);
        expect(Math.abs(ry - y)).toBeLessThan(0.5);
        expect(Math.abs(300 * scaleOf(t) - size)).toBeLessThan(0.5);
      });

      // The "Bleistift auf dem Tisch" label sits at its raw x/y, scaled 1.7x.
      const label = /<g data-olf-id="5a3346b5[^>]*>/.exec(svg)?.[0] ?? '';
      const labelT = parseTransform(attrOf(label, 'transform'));
      const [lx, ly] = applyTransform(labelT, 0, 0);
      expect(Math.abs(lx - 901.5)).toBeLessThan(0.5);
      expect(Math.abs(ly - 95.2)).toBeLessThan(0.5);
      expect(scaleOf(labelT)).toBeCloseTo(1.7, 3);
      // The baseline stays local, so the label's own y is the 19px baseline.
      const inner = /<text [^>]*y="([\d.]+)"/.exec(
        svg.slice(svg.indexOf(label))
      );
      expect(Number(inner?.[1])).toBeCloseTo(15.2, 3);

      // Strokes keep their absolute page coordinates.
      const points = /<polyline [^>]*points="([^"]*)"/.exec(svg)?.[1] ?? '';
      const pairs = points.split(' ').map((p) => p.split(',').map(Number));
      expect(
        Math.abs(Math.min(...pairs.map((p) => p[0])) - 1018.8)
      ).toBeLessThan(0.5);
      expect(Math.abs(Math.min(...pairs.map((p) => p[1])) - 242)).toBeLessThan(
        0.5
      );
    }
  );

  it.skipIf(!fs.existsSync(`${SCRATCH}kreise.olf`))(
    'converts kreise.olf with nothing skipped',
    async () => {
      const { result, svg, svgs } = await convertSample('kreise.olf');
      expect(result.pageCount).toBe(1);
      expect(svgs[0]).toContain('viewBox="0 0 1067 600"');
      expect(result.skipped).toEqual({});
      expect(countOf(svg, /<ellipse /g)).toBe(2);
      expect(countOf(svg, /<image /g)).toBe(4);
      expect(countOf(svg, /marker-end=/g)).toBe(1);
    }
  );

  it.skipIf(!fs.existsSync(`${SCRATCH}sample.olf`))(
    'keeps sample.olf at the declared page size',
    async () => {
      const { svgs } = await convertSample('sample.olf');
      expect(svgs[0]).toContain('viewBox="0 0 1920 1080"');
    }
  );
});
