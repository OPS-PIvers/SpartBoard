import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from './htmlEntities';

describe('decodeHtmlEntities', () => {
  it('keeps the core entities single-pass', () => {
    expect(decodeHtmlEntities('a &amp;lt; b &#39;x&#x27; &quot;')).toBe(
      "a &lt; b 'x' \""
    );
  });

  it('decodes the named entities real pages use for text', () => {
    expect(
      decodeHtmlEntities(
        'Don&rsquo;t&nbsp;stop &mdash; it&apos;s &ldquo;ok&rdquo;&hellip;'
      )
    ).toBe("Don’t stop — it's “ok”…");
  });

  it('leaves unknown names and invalid code points as written', () => {
    expect(decodeHtmlEntities('&bogus; &#0; &#xD800;')).toBe(
      '&bogus; &#0; &#xD800;'
    );
  });
});
