import { describe, expect, it } from 'vitest';
import { webToursUrl } from './appOrigin';

describe('webToursUrl', () => {
  it('opens the Web tours page on the given origin', () => {
    expect(webToursUrl(undefined, 'https://dev.example')).toBe(
      'https://dev.example/web-tours'
    );
  });

  it('names the tour to open in the editor', () => {
    expect(webToursUrl('set_1', 'https://dev.example/')).toBe(
      'https://dev.example/web-tours?edit-web-tour=set_1'
    );
  });
});
