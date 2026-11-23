import { describe, expect, it } from 'vitest';
import {
  parseSubsTourIntent,
  stripSubsTourParams,
  subsEditTourUrl,
  subsRecordTourUrl,
} from './subsTourLinks';

describe('subsTourLinks', () => {
  it('reads an edit link back to its tour', () => {
    const url = new URL(subsEditTourUrl('set a/b'), 'https://x.test');
    expect(url.pathname).toBe('/subs');
    expect(parseSubsTourIntent(url.search)).toEqual({
      kind: 'edit',
      setId: 'set a/b',
    });
  });

  it('reads a record link', () => {
    const url = new URL(subsRecordTourUrl(), 'https://x.test');
    expect(parseSubsTourIntent(url.search)).toEqual({ kind: 'record' });
  });

  it('asks for nothing on a plain /subs address', () => {
    expect(parseSubsTourIntent('')).toBeNull();
    expect(parseSubsTourIntent('?other=1')).toBeNull();
  });

  it('strips only the tour parameters', () => {
    expect(
      stripSubsTourParams(
        'https://x.test/subs/s/share-1?edit-tour=abc&keep=1#top'
      )
    ).toBe('/subs/s/share-1?keep=1#top');
    expect(stripSubsTourParams('https://x.test/subs?record-tour=1')).toBe(
      '/subs'
    );
  });
});
