import { describe, expect, it } from 'vitest';
import { draftLabel, pictureBlob, toWebStep } from './recordedSteps';

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
});

describe('draftLabel', () => {
  it('falls back to the verb alone', () => {
    expect(draftLabel('type', {})).toBe('Type in');
    expect(draftLabel('select', { text: 'Term' })).toBe('Choose from Term');
  });
});

describe('pictureBlob', () => {
  it('accepts only JPEG data URLs', () => {
    expect(pictureBlob('data:image/jpeg;base64,AAAA')?.type).toBe('image/jpeg');
    expect(pictureBlob('data:image/svg+xml;base64,AAAA')).toBeNull();
    expect(pictureBlob('data:image/jpeg;base64,***')).toBeNull();
  });
});
