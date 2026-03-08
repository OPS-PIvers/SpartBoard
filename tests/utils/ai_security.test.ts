
import { describe, it, expect } from 'vitest';
import { validateGridConfig, sanitizeAIConfig } from '@/context/DashboardContext';
import { WidgetType, GridPosition } from '@/types';

describe('DashboardContext AI Security Helpers', () => {
  describe('sanitizeAIConfig', () => {
    it('removes html and activeApp from miniApp config', () => {
      const config = {
        html: '<script>alert("XSS")</script>',
        activeApp: { html: 'malicious' },
        title: 'Safe Title'
      };
      const sanitized = sanitizeAIConfig('miniApp' as WidgetType, config);
      expect(sanitized.html).toBeUndefined();
      expect(sanitized.activeApp).toBeUndefined();
      expect(sanitized.title).toBe('Safe Title');
    });

    it('removes html from embed config', () => {
      const config = {
        html: '<iframe src="malicious"></iframe>',
        url: 'https://example.com'
      };
      const sanitized = sanitizeAIConfig('embed' as WidgetType, config);
      expect(sanitized.html).toBeUndefined();
      expect(sanitized.url).toBe('https://example.com');
    });

    it('validates URLs in embed and qr widgets', () => {
      const maliciousEmbed = sanitizeAIConfig('embed' as WidgetType, { url: 'javascript:alert(1)' });
      expect(maliciousEmbed.url).toBe('');

      const safeEmbed = sanitizeAIConfig('embed' as WidgetType, { url: 'https://google.com' });
      expect(safeEmbed.url).toBe('https://google.com');

      const maliciousQR = sanitizeAIConfig('qr' as WidgetType, { url: 'data:text/html,xss' });
      expect(maliciousQR.url).toBe('');
    });

    it('clamps fontSize in text widget', () => {
      const tooSmall = sanitizeAIConfig('text' as WidgetType, { content: 'hi', fontSize: 2 });
      expect(tooSmall.fontSize).toBe(8);

      const tooLarge = sanitizeAIConfig('text' as WidgetType, { content: 'hi', fontSize: 500 });
      expect(tooLarge.fontSize).toBe(120);
    });

    it('sanitizes poll options', () => {
      const config = {
        question: '?',
        options: [
          { label: 'Good', votes: 100 },
          'Bad',
          { label: 123 }
        ]
      };
      const sanitized = sanitizeAIConfig('poll' as WidgetType, config);
      expect(sanitized.options[0]).toEqual({ label: 'Good', votes: 0 });
      expect(sanitized.options[1]).toEqual({ label: 'Bad', votes: 0 });
      expect(sanitized.options[2]).toEqual({ label: '123', votes: 0 });
    });
  });

  describe('validateGridConfig', () => {
    it('clamps values to valid ranges', () => {
      const input: GridPosition = {
        col: -1,
        row: 15,
        colSpan: 15,
        rowSpan: 5
      };
      const validated = validateGridConfig(input);
      expect(validated).toEqual({
        col: 0,
        row: 11,
        colSpan: 12, // max available for col 0
        rowSpan: 1   // max available for row 11 (12-11)
      });
    });

    it('returns null for non-numeric values', () => {
      expect(validateGridConfig({ col: 'nan' } as any)).toBeNull();
      expect(validateGridConfig({ row: undefined } as any)).toBeNull();
    });

    it('handles floating point values by flooring', () => {
      const input: GridPosition = {
        col: 1.9,
        row: 2.1,
        colSpan: 4.5,
        rowSpan: 3.8
      };
      const validated = validateGridConfig(input);
      expect(validated).toEqual({
        col: 1,
        row: 2,
        colSpan: 4,
        rowSpan: 3
      });
    });
  });
});
