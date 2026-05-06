import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './security';

describe('sanitizeHtml', () => {
  it('should pass through safe HTML', () => {
    const input = '<b>Hello</b> <i>World</i><br/>';
    // DOMParser/DOMPurify normalizes <br/> to <br>
    expect(sanitizeHtml(input)).toBe('<b>Hello</b> <i>World</i><br>');
  });

  it('should remove script tags', () => {
    const input = 'Hello <script>alert(1)</script> World';
    expect(sanitizeHtml(input)).toBe('Hello  World');
  });

  it('should remove event handlers', () => {
    const input = '<div onclick="alert(1)">Click me</div>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onclick');
    expect(output).toContain('Click me');
  });

  it('should remove javascript: links', () => {
    const input = '<a href="javascript:alert(1)">Link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('javascript:');
    expect(output).toContain('Link');
  });

  it('should remove iframes', () => {
    const input = '<iframe src="http://evil.com"></iframe>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<iframe');
  });

  it('should strip svg elements to block SVG-based XSS', () => {
    const input = '<svg onload="alert(1)"></svg>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onload');
    expect(output).not.toContain('<svg');
  });

  it('should handle nested tags', () => {
    const input = '<div><b><script>alert(1)</script>Safe</b></div>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('script');
    expect(output).toContain('<b>Safe</b>');
  });

  it('should remove dangerous data: URIs', () => {
    const input = '<a href="data:text/html;base64,...">Link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('data:text/html');
  });

  it('should allow image data: URIs', () => {
    const input = '<img src="data:image/png;base64,safe">';
    const output = sanitizeHtml(input);
    expect(output).toContain('data:image/png;base64,safe');
  });

  it('should handle case variation', () => {
    const input = '<div onClick="alert(1)" OnMouseOver="alert(1)">Click</div>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onClick');
    expect(output).not.toContain('OnMouseOver');
  });

  it('should handle javascript: case variation', () => {
    const input = '<a href="JaVaScRiPt:alert(1)">Link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('JaVaScRiPt:');
  });

  it('should handle HTML entity encoding bypasses', () => {
    const input =
      '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">Link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('javascript:');
  });

  it('should handle malformed HTML with event handlers', () => {
    const input = '<img src=x onerror=alert(1)>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onerror');
  });

  it('should preserve style attributes for formatting', () => {
    const input =
      '<span style="color: rgb(255, 0, 0); background-color: yellow;">Text</span>';
    const output = sanitizeHtml(input);
    expect(output).toContain(
      'style="color: rgb(255, 0, 0); background-color: yellow;"'
    );
  });

  it('should preserve class attributes', () => {
    const input = '<div class="text-lg font-bold">Styled Text</div>';
    const output = sanitizeHtml(input);
    expect(output).toContain('class="text-lg font-bold"');
  });
});
