import { describe, it, expect } from 'vitest';
import { blobUrlsOf, inlineBlobUrls } from './paperPreviewInline';

describe('blob url helpers', () => {
  it('finds only image src urls, not escaped teacher text', () => {
    const doc =
      '<img src="blob:a/1"><p>blob:a/2 and src=&quot;blob:a/3&quot;</p>';
    expect(blobUrlsOf(doc)).toEqual(['blob:a/1']);
    expect(inlineBlobUrls(doc, new Map([['blob:a/1', 'data:x']]))).toBe(
      '<img src="data:x"><p>blob:a/2 and src=&quot;blob:a/3&quot;</p>'
    );
  });
});
