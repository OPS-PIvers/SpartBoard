import { describe, expect, it } from 'vitest';
import { imageMimeType } from './aiGeneration';

describe('imageMimeType', () => {
  it('uses the type declared in a data URL', () => {
    expect(imageMimeType('data:image/jpeg;base64,AAAA')).toBe('image/jpeg');
    expect(imageMimeType('data:image/webp;base64,AAAA')).toBe('image/webp');
  });

  it('sniffs bare base64 by its magic bytes', () => {
    expect(imageMimeType('/9j/4AAQSkZJRg')).toBe('image/jpeg');
    expect(imageMimeType('R0lGODlhAQAB')).toBe('image/gif');
    expect(imageMimeType('UklGRiQAAABXRUJQ')).toBe('image/webp');
    expect(imageMimeType('iVBORw0KGgo')).toBe('image/png');
  });
});
