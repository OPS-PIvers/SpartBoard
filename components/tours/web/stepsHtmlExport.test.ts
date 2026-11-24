import { describe, expect, it } from 'vitest';
import {
  STEPS_LABELS_EN,
  type StepsViewStep,
} from '@/components/tours/steps/stepsModel';
import {
  articleIssues,
  buildStepsHtml,
  stepTextHtml,
  stepsFileName,
} from './stepsHtmlExport';

const step = (over: Partial<StepsViewStep>): StepsViewStep => ({
  id: 's1',
  title: 'Open Settings',
  text: '',
  onlyIfAppears: false,
  observe: false,
  picture: null,
  ...over,
});

describe('stepTextHtml', () => {
  it('keeps bold, https links and line breaks and escapes the rest', () => {
    expect(
      stepTextHtml('Select **Save**\n<b>x</b> [Help](https://a.b/c?d=1&e=2)')
    ).toBe(
      'Select <strong>Save</strong><br>&lt;b&gt;x&lt;/b&gt; <a href="https://a.b/c?d=1&amp;e=2" target="_blank" rel="noopener noreferrer">Help</a>'
    );
  });

  it('leaves a javascript link as text', () => {
    expect(stepTextHtml('[x](javascript:alert(1))')).toBe(
      '[x](javascript:alert(1))'
    );
  });
});

describe('buildStepsHtml', () => {
  it('writes each step in order with its heading, words and picture', () => {
    const html = buildStepsHtml(
      'Tour <A>',
      [
        step({ text: 'Select it.' }),
        step({
          id: 's2',
          title: '',
          text: 'Wait for the page.',
          message: true,
          continueOn: 'docs.google.com',
        }),
        step({ id: 'blank', title: ' ' }),
        step({ id: 's3', title: 'Pick  one', onlyIfAppears: true }),
      ],
      { s1: { src: 'data:image/png;base64,AAA', width: 640 } },
      STEPS_LABELS_EN,
      {
        intro: 'Turn on <Markdown>.',
        startHost: 'app.schoology.com',
        updated: 'November 23, 2026',
      }
    );
    expect(html).toContain('<title>Tour &lt;A&gt;</title>');
    expect(html).toContain('<h1>Tour &lt;A&gt;</h1>');
    const order = [
      'Turn on &lt;Markdown&gt;.',
      '<strong>Before you start:</strong> open app.schoology.com.',
      'Step 1: Open Settings',
      'Continue on docs.google.com',
      '>Step 2</h2>',
      'Step 3: Pick one',
      'Only if it appears',
      'Last updated November 23, 2026.',
    ].map((s) => html.indexOf(s));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('line-height:1.6">Select it.</p>');
    expect(html).not.toContain('Untitled step');
    expect(html.match(/<h2 /g)).toHaveLength(3);
    expect(html).toContain(
      '<img src="data:image/png;base64,AAA" alt="Picture of step 1" width="640"'
    );
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).not.toMatch(/<script|class=/);
  });
});

describe('articleIssues', () => {
  it('numbers the steps as the article does and leaves blank ones out', () => {
    const picture = { src: '', width: 1, height: 1 } as never;
    expect(
      articleIssues([
        step({ text: 'Select it.', picture }),
        step({ id: 'blank', title: '' }),
        step({ id: 's2', title: '', text: 'Read this.', message: true }),
        step({ id: 's3', title: 'Save' }),
      ])
    ).toEqual({ untitled: [2], noText: [3], noPicture: [3], blank: 1 });
  });
});

describe('stepsFileName', () => {
  it('turns the title into a safe file name', () => {
    expect(stepsFileName('Share a Google Doc!')).toBe(
      'share-a-google-doc.html'
    );
    expect(stepsFileName('***')).toBe('web-tour.html');
  });
});
