import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { isSafeIconUrl, renderCatalystIcon } from './catalystHelpers';

describe('catalystHelpers', () => {
  describe('isSafeIconUrl', () => {
    it('returns false for empty or null strings', () => {
      expect(isSafeIconUrl('')).toBe(false);
      expect(isSafeIconUrl(undefined as unknown as string)).toBe(false);
      expect(isSafeIconUrl(null as unknown as string)).toBe(false);
    });

    it('returns true for valid https URLs', () => {
      expect(isSafeIconUrl('https://example.com/icon.png')).toBe(true);
    });

    it('returns false for non-https URLs', () => {
      expect(isSafeIconUrl('http://example.com/icon.png')).toBe(false);
      expect(isSafeIconUrl('ftp://example.com/icon.png')).toBe(false);
    });

    it('returns false for malformed URLs', () => {
      expect(isSafeIconUrl('not-a-url')).toBe(false);
      expect(isSafeIconUrl('//example.com/icon.png')).toBe(false);
    });

    it('returns true for valid image data URLs', () => {
      const validDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      expect(isSafeIconUrl(validDataUrl)).toBe(true);
    });

    it('returns false for non-image data URLs', () => {
      const invalidDataUrl = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
      expect(isSafeIconUrl(invalidDataUrl)).toBe(false);
    });

    it('returns false for data URLs exceeding the length limit', () => {
      // Create a data URL that's larger than MAX_DATA_URL_LENGTH (100,000)
      const prefix = 'data:image/png;base64,';
      const largeDataUrl = prefix + 'A'.repeat(100000);
      expect(isSafeIconUrl(largeDataUrl)).toBe(false);
    });
  });

  describe('renderCatalystIcon', () => {
    it('renders an img tag for safe URLs', () => {
      const url = 'https://example.com/icon.png';
      const { container } = render(renderCatalystIcon(url, 32, 'test-class'));

      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', url);
      expect(img).toHaveAttribute('alt', '');
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveAttribute('referrerPolicy', 'no-referrer');
      expect(img).toHaveClass('object-contain', 'test-class');
      expect(img).toHaveStyle({ width: '32px', height: '32px' });
    });

    it('renders a Lucide icon for valid icon names', () => {
      const { container } = render(
        renderCatalystIcon('Activity', 24, 'icon-class')
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('icon-class');
      expect(svg).toHaveStyle({ width: '24px', height: '24px' });
    });

    it('renders the fallback icon (Zap) for invalid icon names', () => {
      const { container } = render(
        renderCatalystIcon('InvalidIconName', 24, 'fallback-class')
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('fallback-class');
      expect(svg).toHaveStyle({ width: '24px', height: '24px' });
    });

    it('supports string sizes (like CSS min functions)', () => {
      const size = 'min(24px, 8cqmin)';
      const { container } = render(renderCatalystIcon('Activity', size));

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveStyle({
        width: size,
        height: size,
      });
    });
  });
});
