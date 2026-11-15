import { describe, it, expect } from 'vitest';
import { stimulusDisplayName } from '@/utils/quizStimuli';

const base = { label: '', url: '', type: 'image' as const };

describe('stimulusDisplayName', () => {
  it('prefers a custom label', () => {
    expect(stimulusDisplayName({ ...base, label: '  Map ' })).toBe('Map');
  });
  it('uses the passage when the label is the default type name', () => {
    expect(
      stimulusDisplayName({
        type: 'text',
        url: '',
        label: 'Passage',
        text: 'Volcanoes  form\nhere.',
      })
    ).toBe('Volcanoes form here.');
  });
  it('clips long passages', () => {
    const name = stimulusDisplayName({
      type: 'text',
      url: '',
      label: '',
      text: 'a'.repeat(80),
    });
    expect(name).toBe(`${'a'.repeat(60)}…`);
  });
  it('uses a file name from the URL', () => {
    expect(
      stimulusDisplayName({
        ...base,
        url: 'https://x.org/img/My%20map.png?x=1',
      })
    ).toBe('My map.png');
  });
  it('survives a malformed escape', () => {
    expect(
      stimulusDisplayName({ ...base, url: 'https://x.org/100%.png' })
    ).toBe('100%.png');
  });
  it('falls back to the type for Drive, YouTube, data and extensionless URLs', () => {
    for (const url of [
      'https://drive.google.com/file/d/abc/view',
      'https://www.youtube.com/watch?v=abc',
      'https://docs.google.com/document/d/abc/edit',
      'data:image/svg+xml;utf8,%3Csvg%3E',
      'https://x.org/page',
    ])
      expect(stimulusDisplayName({ ...base, url })).toBe('Image');
    expect(
      stimulusDisplayName({
        ...base,
        url: 'https://x.org/a.png',
        driveFileId: 'd',
      })
    ).toBe('Image');
  });
});
