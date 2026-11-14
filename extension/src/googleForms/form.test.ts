import { describe, expect, it } from 'vitest';
import {
  formFromLoadData,
  googleFormPage,
  itemPictures,
  loadDataFrom,
  readGoogleForm,
} from './form';
import sample from './fixtures/questionTypes.json';

const EDIT_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg';

describe('googleFormPage', () => {
  it.each([
    [`https://docs.google.com/forms/d/${EDIT_ID}/edit`, 'edit'],
    [`https://docs.google.com/forms/u/1/d/${EDIT_ID}/edit#responses`, 'edit'],
    [
      'https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform?usp=sf_link',
      'view',
    ],
    ['https://docs.google.com/forms/u/0/d/e/1FAIpQLSabc/viewform', 'view'],
  ])('reads %s as %s', (href, kind) => {
    expect(googleFormPage(href)?.kind).toBe(kind);
  });

  it.each([
    'https://docs.google.com/forms/d/e/1FAIpQLSabc/formResponse',
    `https://docs.google.com/forms/d/${EDIT_ID}/viewanalytics`,
    'https://docs.google.com/document/d/abc/edit',
    `https://evil.example/forms/d/${EDIT_ID}/edit`,
    'not a url',
  ])('ignores %s', (href) => {
    expect(googleFormPage(href)).toBeNull();
  });

  it('keeps the editor id', () => {
    expect(
      googleFormPage(`https://docs.google.com/forms/d/${EDIT_ID}/edit`)
    ).toEqual({ kind: 'edit', formId: EDIT_ID });
  });
});

describe('formFromLoadData on a real public form', () => {
  const read = formFromLoadData(sample);
  if (!read.ok) throw new Error(read.reason);
  const byText = (start: string) =>
    read.form.items.find((i) => i.text.startsWith(start));

  it('reads the title and every question type', () => {
    expect(read.title).toBe(
      'Understanding Different Question Types in Google Forms'
    );
    expect(byText('Your first name')?.kind).toBe('short');
    expect(byText('Describe the perfect holiday')?.kind).toBe('paragraph');
    expect(byText('Where would you prefer')?.kind).toBe('choice');
    expect(byText('Holiday activities')?.kind).toBe('checkbox');
    expect(byText('On which continent')?.kind).toBe('dropdown');
    expect(byText('How do you feel about')?.kind).toBe('grid');
    expect(byText('Where would you like to do')?.kind).toBe('checkboxGrid');
  });

  it('reads choices, scale ends and grid rows', () => {
    expect(byText('Where would you prefer')).toMatchObject({
      options: [
        { text: 'Tanzania' },
        { text: 'Vietnam' },
        { text: 'Peru' },
        { text: 'France' },
        { text: 'Canada' },
      ],
    });
    expect(byText('How much do you enjoy')).toMatchObject({
      kind: 'scale',
      low: 1,
      high: 10,
      lowLabel: 'Not at all',
      highLabel: 'Very much',
    });
    const grid = byText('How do you feel about');
    expect(grid && 'rows' in grid ? grid.rows : []).toHaveLength(4);
    expect(grid && 'options' in grid ? grid.options?.[0] : null).toEqual({
      text: 'Strongly disagree',
    });
  });

  it('drops the Other box and counts what it leaves out', () => {
    const useful = byText('Did you find this question overview useful?');
    expect(useful && 'options' in useful ? useful.options : []).toEqual([
      { text: 'Yes' },
      { text: 'No' },
    ]);
    // No pictures drawn: two question pictures, the image item and five choice pictures.
    expect(read.form.leftOut).toMatchObject({
      date: 1,
      time: 1,
      video: 1,
    });
    expect(read.form.leftOut?.picture).toBeGreaterThan(0);
    expect(read.form.formId).toBeUndefined();
  });

  it('never carries a key from the page', () => {
    expect(read.form.items.some((i) => 'correct' in i)).toBe(false);
  });

  it('also sends the questions as page text', () => {
    expect(read.blocks[0]).toEqual({
      type: 'heading',
      level: 1,
      text: read.title,
    });
    expect(read.blocks.some((b) => 'text' in b && b.text === 'Tanzania')).toBe(
      true
    );
  });
});

describe('pictures', () => {
  const PIC = 'https://docs.google.com/forms-images-rt/AMfapbOne';
  const PIC2 = 'https://docs.google.com/forms-images-rt/AMfapbTwo';
  const PIC3 = 'https://docs.google.com/forms-images-rt/AMfapbThree';
  const data = [
    null,
    [
      '',
      [
        [11, 'A map', null, 11, null, null, ['img', 0, [1, 1, 0]]],
        [
          22,
          'Which falls?',
          null,
          2,
          [
            [
              1,
              [
                ['Niagara', null, null, null, 0, ['i1']],
                ['Angel', null, null, null, 0, ['i2']],
              ],
              0,
            ],
          ],
          null,
          null,
          null,
          null,
          [['qimg', null, [1, 1, 0]]],
        ],
      ],
      null,
      null,
      null,
      null,
      null,
      null,
      'Falls',
    ],
  ];

  it('matches the pictures the page drew to the item, the question and each choice', () => {
    document.body.innerHTML = `
      <div data-item-id="11"><img src="${PIC}"></div>
      <div data-item-id="22"><img src="${PIC2}"><img src="${PIC3}"><img src="${PIC}"><img src="https://evil.example/x.png"></div>`;
    const read = formFromLoadData(data, itemPictures(document));
    if (!read.ok) throw new Error(read.reason);
    expect(read.form.items[0]).toEqual({
      kind: 'image',
      text: 'A map',
      image: PIC,
    });
    expect(read.form.items[1]).toMatchObject({
      image: PIC2,
      options: [
        { text: 'Niagara', image: PIC3 },
        { text: 'Angel', image: PIC },
      ],
    });
    expect(read.form.leftOut).toBeUndefined();
  });

  it('counts choice pictures it cannot place', () => {
    document.body.innerHTML = `<div data-item-id="22"><img src="${PIC2}"><img src="${PIC3}"></div>`;
    const read = formFromLoadData(data, itemPictures(document));
    if (!read.ok) throw new Error(read.reason);
    expect(read.form.items[0]).toMatchObject({
      image: PIC2,
      options: [{ text: 'Niagara' }, { text: 'Angel' }],
    });
    expect(read.form.leftOut).toEqual({ picture: 3 });
  });
});

describe('readGoogleForm', () => {
  const html = (data: unknown) =>
    `<html><body><script>var ${'FB_PUBLIC_LOAD_DATA_'} = ${JSON.stringify(data)};</script></body></html>`;

  it('reads the open responder page', async () => {
    document.body.innerHTML = '';
    const script = document.createElement('script');
    script.textContent = `var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(sample)};`;
    document.body.append(script);
    expect(loadDataFrom(document)).toEqual(sample);
    const read = await readGoogleForm({ kind: 'view' }, document);
    expect(read.ok).toBe(true);
  });

  it('reads the editor’s responder page and keeps the editor id', async () => {
    const urls: string[] = [];
    const read = await readGoogleForm(
      { kind: 'edit', formId: EDIT_ID },
      document,
      (url) => {
        urls.push(url);
        return Promise.resolve(html(sample));
      }
    );
    expect(urls).toEqual([
      `https://docs.google.com/forms/d/${EDIT_ID}/viewform`,
    ]);
    expect(read.ok && read.form.formId).toBe(EDIT_ID);
  });

  it('says why when the page has no form data', async () => {
    const read = await readGoogleForm(
      { kind: 'edit', formId: EDIT_ID },
      document,
      () => Promise.resolve('<html></html>')
    );
    expect(read).toEqual({ ok: false, reason: 'no form data on the page' });
  });
});
