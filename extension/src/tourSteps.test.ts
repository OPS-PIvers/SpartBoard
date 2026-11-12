import { describe, expect, it } from 'vitest';
import { panelStepsOf } from './tourSteps';

const loaded = (over: Record<string, unknown> = {}) => ({
  setId: 's',
  version: 1,
  title: 'Post a grade',
  steps: [
    {
      id: 'a',
      label: 'Open the gradebook',
      text: 'Pick your course.',
      web: {
        urlPattern: 'https://App.example.com/home',
        action: 'click',
        locator: { role: 'link', name: 'Gradebook' },
      },
    },
    {
      id: 'b',
      label: 'Check the list',
      text: '',
      web: {
        urlPattern: 'https://app.example.com/grades',
        action: 'observe',
        locator: {},
      },
    },
  ],
  pictures: {
    a: {
      mime: 'image/jpeg',
      data: 'AAAA',
      w: 800,
      h: 400,
      cssW: 640,
      target: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
    },
  },
  ...over,
});

describe('panelStepsOf', () => {
  it('keeps Message steps in order and marks where the tour changes site', () => {
    const msg = {
      id: 'm',
      label: 'Over to Claude',
      text: 'Next we switch.',
      message: true,
    };
    const out = panelStepsOf(
      loaded({
        steps: [
          msg,
          ...(loaded().steps as object[]),
          {
            id: 'c',
            label: 'Upload',
            text: '',
            web: {
              urlPattern: 'https://claude.ai/customize',
              action: 'click',
              locator: {},
            },
          },
          { id: 'e', label: 'Done', text: 'All set.', message: true },
        ],
      })
    );
    expect(out?.host).toBe('app.example.com');
    expect(out?.steps.map((s) => [s.id, !!s.message, s.continueOn])).toEqual([
      ['m', true, undefined],
      ['a', false, undefined],
      ['b', false, undefined],
      ['c', false, 'claude.ai'],
      ['e', true, undefined],
    ]);
    expect(out?.steps[0].picture).toBeNull();
  });

  it('keeps a well-formed public link token and drops anything else', () => {
    const token = 'a'.repeat(32);
    expect(panelStepsOf({ ...loaded(), link: token })?.link).toBe(token);
    expect(panelStepsOf(loaded())?.link).toBeUndefined();
    expect(
      panelStepsOf({ ...loaded(), link: 'https://evil.example' })?.link
    ).toBeUndefined();
  });

  it('turns a loaded tour into steps and data-URL pictures', () => {
    const out = panelStepsOf(loaded());
    expect(out?.title).toBe('Post a grade');
    expect(out?.host).toBe('app.example.com');
    expect(out?.steps.map((s) => [s.id, s.title, s.text])).toEqual([
      ['a', 'Open the gradebook', 'Pick your course.'],
      ['b', 'Check the list', ''],
    ]);
    expect(out?.steps[0].picture).toEqual({
      w: 800,
      h: 400,
      cssW: 640,
      target: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
    });
    expect(out?.pictures).toEqual({
      a: { status: 'ready', src: 'data:image/jpeg;base64,AAAA' },
    });
    expect(out?.steps[1].observe).toBe(true);
    expect(out?.steps[1].picture).toBeNull();
  });

  it('notes a step the tour only shows on some pages, from the conditions sent beside the steps', () => {
    const out = panelStepsOf(
      loaded({ conditions: { b: { showWhen: { kind: 'target' } } } })
    );
    expect(out?.steps.map((s) => s.onlyIfAppears)).toEqual([false, true]);
  });

  it('carries the markup on a picture and leaves out shapes it does not know', () => {
    const out = panelStepsOf(
      loaded({
        pictures: {
          a: {
            mime: 'image/png',
            data: 'AAAA',
            w: 800,
            h: 400,
            markup: [
              { id: 'm', kind: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
              { id: 'z', kind: 'blob' },
            ],
          },
        },
      })
    );
    expect(out?.steps[0].picture?.markup).toEqual([
      { id: 'm', kind: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    ]);
  });

  it('draws no ring for a picture sent without its target', () => {
    const out = panelStepsOf(
      loaded({
        pictures: { a: { mime: 'image/png', data: 'AAAA', w: 800, h: 400 } },
      })
    );
    expect(out?.steps[0].picture?.target).toBeNull();
  });

  it('drops a picture of a type it will not show, rather than putting it in a page', () => {
    const out = panelStepsOf(
      loaded({
        pictures: { a: { mime: 'image/svg+xml', data: 'AAAA', w: 8, h: 4 } },
      })
    );
    expect(out?.pictures).toEqual({});
    expect(out?.steps[0].picture).toBeNull();
  });

  it('refuses anything that is not a tour with steps', () => {
    expect(panelStepsOf(null)).toBeNull();
    expect(panelStepsOf({ steps: [] })).toBeNull();
    expect(panelStepsOf({ steps: [{ id: 1 }] })).toBeNull();
  });
});
