import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderStepText } from './richText';

const html = (text: string): HTMLElement => {
  const p = render(<p>{renderStepText(text)}</p>).container.querySelector('p');
  if (!p) throw new Error('no paragraph');
  return p;
};

describe('renderStepText', () => {
  it('returns plain text unchanged', () => {
    expect(renderStepText('Click Save.')).toBe('Click Save.');
    expect(renderStepText(undefined)).toBeNull();
  });

  it('renders **bold** as <strong>', () => {
    const p = html('Press **Save** now');
    expect(p.querySelector('strong')?.textContent).toBe('Save');
    expect(p.textContent).toBe('Press Save now');
  });

  it('renders an https link that opens safely in a new tab', () => {
    const p = html('See [the guide](https://example.com/a?b=1) first');
    const a = p.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com/a?b=1');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a?.textContent).toBe('the guide');
  });

  it('escapes HTML and rejects javascript: and http: links', () => {
    const p = html(
      '<script>alert(1)</script> [x](javascript:alert(1)) [y](http://a.b)'
    );
    expect(p.querySelector('script')).toBeNull();
    expect(p.querySelector('a')).toBeNull();
    expect(p.textContent).toBe(
      '<script>alert(1)</script> [x](javascript:alert(1)) [y](http://a.b)'
    );
  });

  it('handles several tokens and leaves unmatched markers literal', () => {
    const p = html('**a** and **b** but **c');
    expect(p.querySelectorAll('strong')).toHaveLength(2);
    expect(p.textContent).toBe('a and b but **c');
  });
});
