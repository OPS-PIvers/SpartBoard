import { describe, expect, it } from 'vitest';
import {
  draftLabel,
  pictureBlob,
  scrubLocator,
  toWebStep,
} from './recordedSteps';

describe('toWebStep', () => {
  it('makes a web step with a starter title and no tour binding', () => {
    const step = toWebStep({
      id: 's1',
      urlPattern: 'https://orono.schoology.com/course/*/materials?f=*',
      action: 'click',
      locator: { role: 'link', name: 'Add Materials' },
    });
    expect(step).toMatchObject({
      id: 's1',
      label: 'Click Add Materials',
      web: {
        urlPattern: 'https://orono.schoology.com/course/*/materials?f=*',
        action: 'click',
        locator: { role: 'link', name: 'Add Materials' },
      },
    });
    expect(step.tour).toBeUndefined();
    expect(step.text).toBe('');
  });

  it('keeps the tip typed in the side panel', () => {
    const step = toWebStep({
      id: 's3',
      urlPattern: 'https://docs.google.com/document/d/*/edit',
      action: 'click',
      locator: { role: 'menuitem', name: 'Apps Script' },
      tip: '  Opens in a new tab. ',
    });
    expect(step.text).toBe('Opens in a new tab.');
  });

  it('scrubs captured text and addresses again on the page side', () => {
    const step = toWebStep({
      id: 's2',
      urlPattern: 'https://x.example/students/2045831',
      action: 'click',
      locator: {
        name: 'Email a@b.org',
        text: '   ',
        frames: [{ urlPattern: 'https://y.example/p/99812', index: 0 }],
      },
    });
    expect(step.web?.urlPattern).toBe('https://x.example/students/*');
    expect(step.web?.locator).toEqual({
      name: 'Email •••',
      frames: [{ urlPattern: 'https://y.example/p/*', index: 0 }],
    });
  });

  it('scrubs the heading, page title and stable attributes again', () => {
    const step = toWebStep({
      id: 's4',
      urlPattern: 'https://x.example/grades',
      action: 'click',
      locator: {
        role: 'link',
        heading: 'Grades for jane.doe@orono.k12.mn.us',
        pageTitle: 'Student 2045831 | Schoology',
        attrs: {
          testId: 'open-row',
          ariaLabel: 'Open 2045831',
          name: '   ',
          href: '/students/2045831/grades',
          // @ts-expect-error a key the page never stores
          onclick: 'x',
        },
      },
    });
    expect(step.web?.locator).toEqual({
      role: 'link',
      heading: 'Grades for •••',
      pageTitle: 'Student ••• | Schoology',
      attrs: {
        testId: 'open-row',
        ariaLabel: 'Open •••',
        href: '/students/*/grades',
      },
    });
  });

  it('drops empty stable attributes', () => {
    const step = toWebStep({
      id: 's5',
      urlPattern: 'https://x.example/',
      action: 'click',
      locator: { role: 'button', attrs: { ariaLabel: ' ' } },
    });
    expect(step.web?.locator).toEqual({ role: 'button' });
  });
});

describe('scrubLocator', () => {
  it('scrubs a repicked target the same way as a new recording', () => {
    expect(
      scrubLocator({
        name: 'Open 2045831',
        heading: 'Grades for jane.doe@orono.k12.mn.us',
        attrs: { href: 'https://lms.example/students/2045831/grades' },
      })
    ).toEqual({
      name: 'Open •••',
      heading: 'Grades for •••',
      attrs: { href: 'https://lms.example/students/*/grades' },
    });
  });
});

describe('draftLabel', () => {
  it('falls back to the verb alone', () => {
    expect(draftLabel('type', {})).toBe('Type in');
    expect(draftLabel('select', { text: 'Term' })).toBe('Choose from Term');
  });

  it('drops icon-font glyphs that show as boxes', () => {
    expect(draftLabel('click', { name: '\uE8B8Connectors\uE5CC' })).toBe(
      'Click Connectors'
    );
    expect(draftLabel('click', { name: '\uE145', text: 'Add' })).toBe(
      'Click Add'
    );
  });
});

describe('pictureBlob', () => {
  it('accepts only JPEG data URLs', () => {
    expect(pictureBlob('data:image/jpeg;base64,AAAA')?.type).toBe('image/jpeg');
    expect(pictureBlob('data:image/svg+xml;base64,AAAA')).toBeNull();
    expect(pictureBlob('data:image/jpeg;base64,***')).toBeNull();
  });
});
