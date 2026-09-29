// Reading every question bank out of a Schoology collection export.

import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import {
  collectionTitle,
  readCartridge,
  readCartridgeBanks,
} from '@/utils/quizDocumentImport/cartridgeReader';

const html = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const mc = (
  ident: string,
  stemHtml: string,
  choices: Array<[string, string]>,
  key: string
): string => `
  <item ident="${ident}">
    <itemmetadata><qtimetadata><qtimetadatafield>
      <fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry>
    </qtimetadatafield></qtimetadata></itemmetadata>
    <presentation>
      <material><mattext texttype="text/html">${html(stemHtml)}</mattext></material>
      <response_lid ident="r${ident}" rcardinality="Single"><render_choice>
        ${choices
          .map(
            ([id, text]) =>
              `<response_label ident="${id}"><material><mattext texttype="text/plain">${text}</mattext></material></response_label>`
          )
          .join('')}
      </render_choice></response_lid>
    </presentation>
    <resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
      <respcondition continue="No"><conditionvar><varequal respident="r${ident}">${key}</varequal></conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar></respcondition>
    </resprocessing>
  </item>`;

const bank = (id: string, items: string): string =>
  `<?xml version="1.0"?><questestinterop><objectbank ident="${id}">${items}</objectbank></questestinterop>`;

const test = (items: string): string =>
  `<?xml version="1.0"?><questestinterop><assessment ident="t" title="Unit 3 Test"><section ident="root_section">${items}</section></assessment></questestinterop>`;

const resource = (id: string, kind: 'question-bank' | 'assessment'): string =>
  `<resource identifier="${id}" type="imsqti_xmlv1p2/imscc_xmlv1p2/${kind}"><file href="${id}/${id}.xml"/></resource>`;

const MANIFEST = `<?xml version="1.0"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p2/LOM/manifest">
  <metadata><lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>Home : World History Tests</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom></metadata>
  <organizations><organization identifier="org" structure="rooted-hierarchy"><item identifier="root">
    <item identifier="f1"><title>Unit 2</title>
      <item identifier="i1" identifierref="b1"><title>Greece</title></item>
      <item identifier="f2"><title>MCQ M</title>
        <item identifier="i2" identifierref="b2"><title>Greece</title></item>
      </item>
      <item identifier="i3" identifierref="b3"><title>Matching</title></item>
      <item identifier="i4" identifierref="t1"><title>Unit 3 Test</title></item>
    </item>
    <item identifier="i5" identifierref="b4"><title>French Rev</title></item>
  </item></organization></organizations>
  <resources>
    ${resource('t1', 'assessment')}
    ${resource('b1', 'question-bank')}
    ${resource('b2', 'question-bank')}
    ${resource('b3', 'question-bank')}
    ${resource('b4', 'question-bank')}
  </resources>
</manifest>`;

const CHOICES: Array<[string, string]> = [
  ['1', 'Athens'],
  ['2', 'Sparta'],
  ['3', 'Thebes'],
];

async function exportZip(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('imsmanifest.xml', MANIFEST);
  zip.file(
    'b1/b1.xml',
    bank(
      'b1',
      mc('1', '<p>Which city built the Parthenon?</p>', CHOICES, '1') +
        mc(
          '2',
          '<p>Read the source.</p><table><tr><td>Year</td><td>Event</td></tr><tr><td>490 BC</td><td>Marathon</td></tr></table><p>What happened first?</p>',
          CHOICES,
          '2'
        )
    )
  );
  zip.file(
    'b2/b2.xml',
    // Schoology sometimes writes a blank ident and an empty key for the right choice.
    bank(
      'b2',
      mc(
        '1',
        '<p>Which city built the Parthenon?</p>',
        [
          ['', 'Athens'],
          ['2', 'Sparta'],
        ],
        ''
      )
    )
  );
  zip.file('b3/b3.xml', bank('b3', ''));
  zip.file(
    'b4/b4.xml',
    bank(
      'b4',
      mc(
        '1',
        '<p><img src="https://lh4.googleusercontent.com/abc/cartoon" /></p><p>What does the cartoon show?</p>',
        CHOICES,
        '3'
      ) +
        mc(
          '2',
          '<p><img src="https://example.com/also.png" /></p><p>Second?</p>',
          CHOICES,
          '1'
        )
    )
  );
  zip.file('t1/t1.xml', test(mc('1', '<p>Test only</p>', CHOICES, '1')));
  return zip.generateAsync({ type: 'blob' });
}

const PNG = {
  blob: new Blob([new Uint8Array([137, 80])]),
  contentType: 'image/png',
};

describe('readCartridgeBanks', () => {
  it('reads every bank with its folder path and skips tests', async () => {
    const fetchRemoteImage = vi.fn((url: string) =>
      Promise.resolve(url.includes('googleusercontent') ? PNG : null)
    );
    const result = await readCartridgeBanks(await exportZip(), 'fallback', {
      fetchRemoteImage,
    });

    expect(result.title).toBe('World History Tests');
    expect(result.skippedTests).toBe(1);
    expect(
      result.banks.map((b) => [...b.folderPath, b.title].join(' > '))
    ).toEqual([
      'Unit 2 > Greece',
      'Unit 2 > MCQ M > Greece',
      'Unit 2 > Matching',
      'French Rev',
    ]);
    expect(result.banks.map((b) => b.questions.length)).toEqual([2, 1, 0, 2]);
  });

  it('reads every quiz instead when asked for tests, skipping banks', async () => {
    const result = await readCartridgeBanks(await exportZip(), 'fallback', {
      read: 'tests',
    });
    expect(result.skippedBanks).toBe(4);
    expect(result.skippedTests).toBe(0);
    expect(
      result.banks.map((b) => [...b.folderPath, b.title].join(' > '))
    ).toEqual(['Unit 2 > Unit 3 Test']);
    expect(result.banks[0].questions.map((q) => q.text)).toEqual(['Test only']);
  });

  it('keeps paragraph breaks and reads a table one row per line', async () => {
    const { banks } = await readCartridgeBanks(await exportZip(), 'x');
    expect(banks[0].questions[1].text).toBe(
      'Read the source.\nYear | Event\n490 BC | Marathon\nWhat happened first?'
    );
    expect(banks[0].questions[0].correctAnswer).toBe('Athens');
  });

  it('keeps a key that points at a choice with a blank ident', async () => {
    const { banks } = await readCartridgeBanks(await exportZip(), 'x');
    expect(banks[1].questions[0].correctAnswer).toBe('Athens');
    expect(banks[1].questions[0].warnings).toEqual([]);
  });

  it('copies linked pictures and flags the ones it could not copy', async () => {
    const fetchRemoteImage = vi.fn((url: string) =>
      Promise.resolve(url.includes('googleusercontent') ? PNG : null)
    );
    const { banks } = await readCartridgeBanks(await exportZip(), 'x', {
      fetchRemoteImage,
    });
    const [first, second] = banks[3].questions;
    expect(fetchRemoteImage).toHaveBeenCalledTimes(2);
    expect(first.imageIds).toEqual(['img-1']);
    expect(banks[3].images).toHaveLength(1);
    expect(banks[3].images[0].contentType).toBe('image/png');
    expect(first.text).toBe('What does the cartoon show?');
    expect(second.imageIds).toEqual([]);
    expect(second.warnings.join(' ')).toMatch(/linked from another website/);
  });

  it('flags linked pictures when no fetcher is supplied', async () => {
    const { banks } = await readCartridgeBanks(await exportZip(), 'x');
    expect(banks[3].images).toEqual([]);
    expect(banks[3].questions[0].warnings.join(' ')).toMatch(
      /linked from another website/
    );
  });

  it('refuses a file that is not an LMS export', async () => {
    await expect(
      readCartridgeBanks(new Blob(['not a zip']), 'x')
    ).rejects.toThrow(/doesn’t look like an LMS export/);
  });

  it('lets the single-test reader copy linked pictures too', async () => {
    const zip = new JSZip();
    zip.file('imsmanifest.xml', '<manifest/>');
    zip.file(
      'q.xml',
      test(
        mc(
          '1',
          '<p><img src="https://x.test/a.png"/></p><p>Q</p>',
          CHOICES,
          '1'
        )
      )
    );
    const quiz = await readCartridge(
      await zip.generateAsync({ type: 'blob' }),
      'x',
      undefined,
      { fetchRemoteImage: () => Promise.resolve(PNG) }
    );
    expect(quiz.images).toHaveLength(1);
    expect(quiz.questions[0].imageIds).toEqual(['img-1']);
  });
});

describe('collectionTitle', () => {
  it('drops the Schoology breadcrumb', () => {
    expect(collectionTitle('Home : World History Tests', 'f')).toBe(
      'World History Tests'
    );
    expect(collectionTitle('Plain', 'f')).toBe('Plain');
    expect(collectionTitle('  ', 'fallback')).toBe('fallback');
  });
});
