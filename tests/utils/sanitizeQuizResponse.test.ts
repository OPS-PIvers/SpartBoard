import { describe, it, expect } from 'vitest';
import { sanitizeQuizResponse } from '@/utils/security';

describe('sanitizeQuizResponse', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeQuizResponse('')).toBe('');
  });

  it('preserves whitelisted semantic tags', () => {
    const html =
      '<p><b>bold</b> <strong>strong</strong> <i>i</i> <em>em</em> <u>u</u></p>';
    expect(sanitizeQuizResponse(html)).toContain('<b>bold</b>');
    expect(sanitizeQuizResponse(html)).toContain('<strong>strong</strong>');
    expect(sanitizeQuizResponse(html)).toContain('<em>em</em>');
    expect(sanitizeQuizResponse(html)).toContain('<u>u</u>');
  });

  it('preserves lists and line breaks', () => {
    const html = '<ul><li>one</li><li>two</li></ul><br><ol><li>a</li></ol>';
    const out = sanitizeQuizResponse(html);
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<ol>');
    expect(out).toContain('<br>');
  });

  it('strips <span> wrappers but keeps text', () => {
    const out = sanitizeQuizResponse(
      '<span style="color:red">hello</span> world'
    );
    expect(out).not.toContain('<span');
    expect(out).not.toContain('style');
    expect(out).toContain('hello');
    expect(out).toContain('world');
  });

  it('strips <font> tags (execCommand byproduct) but keeps text', () => {
    const out = sanitizeQuizResponse('<font color="red">hello</font>');
    expect(out).not.toContain('<font');
    expect(out).not.toContain('color');
    expect(out).toContain('hello');
  });

  it('strips <div> wrappers', () => {
    const out = sanitizeQuizResponse('<div>x</div>');
    expect(out).not.toContain('<div');
    expect(out).toContain('x');
  });

  it('strips <script> tags entirely', () => {
    const out = sanitizeQuizResponse('<script>alert(1)</script><b>safe</b>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert');
    expect(out).toContain('<b>safe</b>');
  });

  it('strips event-handler attributes', () => {
    const out = sanitizeQuizResponse('<b onclick="alert(1)">x</b>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('<b>');
    expect(out).toContain('x');
  });

  it('strips class and style attributes', () => {
    const out = sanitizeQuizResponse(
      '<p class="rich" style="font-weight:bold">x</p>'
    );
    expect(out).not.toContain('class=');
    expect(out).not.toContain('style=');
    expect(out).toContain('<p>x</p>');
  });

  it('strips anchor tags and their hrefs', () => {
    const out = sanitizeQuizResponse(
      '<a href="https://example.com">link</a> text'
    );
    expect(out).not.toContain('<a ');
    expect(out).not.toContain('href');
    expect(out).toContain('link');
    expect(out).toContain('text');
  });

  it('strips img tags entirely', () => {
    const out = sanitizeQuizResponse('<img src="x" onerror="alert(1)">caption');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror');
    expect(out).toContain('caption');
  });

  it('round-trips already-sanitized HTML idempotently', () => {
    const clean = '<p><b>hello</b> world</p>';
    expect(sanitizeQuizResponse(sanitizeQuizResponse(clean))).toBe(
      sanitizeQuizResponse(clean)
    );
  });
});
