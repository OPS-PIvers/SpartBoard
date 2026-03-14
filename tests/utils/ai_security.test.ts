import { describe, it, expect } from 'vitest';
import { validateGridConfig, sanitizeAIConfig } from '@/utils/ai_security';
import {
  WidgetType,
  GridPosition,
  MiniAppConfig,
  EmbedConfig,
  TextConfig,
  PollConfig,
  WidgetConfig,
  ScoreboardConfig,
  RandomConfig,
} from '@/types';

describe('DashboardContext AI Security Helpers', () => {
  describe('sanitizeAIConfig', () => {
    it('removes html and activeApp from miniApp config', () => {
      const config = {
        html: '<script>alert("XSS")</script>',
        activeApp: { html: 'malicious' },
        title: 'Safe Title',
      };
      const sanitized = sanitizeAIConfig(
        'miniApp' as WidgetType,
        config as unknown as Partial<WidgetConfig>
      ) as MiniAppConfig;
      expect(
        (sanitized as unknown as Record<string, unknown>).html
      ).toBeUndefined();
      expect(sanitized.activeApp).toBeUndefined();
    });

    it('removes html from embed config', () => {
      const config = {
        html: '<iframe src="malicious"></iframe>',
        url: 'https://example.com',
      };
      const sanitized = sanitizeAIConfig(
        'embed' as WidgetType,
        config as unknown as Partial<WidgetConfig>
      ) as EmbedConfig;
      expect(
        (sanitized as unknown as Record<string, unknown>).html
      ).toBeUndefined();
      expect(sanitized.url).toBe('https://example.com/');
    });

    it('validates URLs in embed and qr widgets', () => {
      const maliciousEmbed = sanitizeAIConfig(
        'embed' as WidgetType,
        {
          url: 'javascript:alert(1)',
        } as unknown as Partial<WidgetConfig>
      ) as EmbedConfig;
      expect(maliciousEmbed.url).toBe('');

      const safeEmbed = sanitizeAIConfig(
        'embed' as WidgetType,
        {
          url: 'https://google.com',
        } as unknown as Partial<WidgetConfig>
      ) as EmbedConfig;
      expect(safeEmbed.url).toBe('https://google.com/');

      const maliciousQR = sanitizeAIConfig(
        'qr' as WidgetType,
        {
          url: 'data:text/html,xss',
        } as unknown as Partial<WidgetConfig>
      ) as unknown as Record<string, unknown>;
      expect(maliciousQR.url).toBe('');
    });

    it('clamps fontSize in text widget', () => {
      const tooSmall = sanitizeAIConfig(
        'text' as WidgetType,
        {
          content: 'hi',
          fontSize: 2,
        } as unknown as Partial<WidgetConfig>
      ) as TextConfig;
      expect(tooSmall.fontSize).toBe(8);

      const tooLarge = sanitizeAIConfig(
        'text' as WidgetType,
        {
          content: 'hi',
          fontSize: 500,
        } as unknown as Partial<WidgetConfig>
      ) as TextConfig;
      expect(tooLarge.fontSize).toBe(120);
    });

    it('sanitizes poll options', () => {
      const config = {
        question: '?',
        options: [{ label: 'Good', votes: 100 }, 'Bad', { label: 123 }],
      };
      const sanitized = sanitizeAIConfig(
        'poll' as WidgetType,
        config as unknown as Partial<WidgetConfig>
      ) as PollConfig;
      expect(sanitized.options[0]).toEqual({ label: 'Good', votes: 0 });
      expect(sanitized.options[1]).toEqual({ label: 'Bad', votes: 0 });
      expect(sanitized.options[2]).toEqual({ label: '123', votes: 0 });
    });

    it('sanitizes scoreboard teams', () => {
      const configWithArray = {
        teams: ['Eagles', { name: 'Tigers', score: 50, color: '#f00' }, 123],
      };
      const sanitizedArray = sanitizeAIConfig(
        'scoreboard' as WidgetType,
        configWithArray as unknown as Partial<WidgetConfig>
      ) as ScoreboardConfig;

      const teams = sanitizedArray.teams ?? [];
      expect(teams).toHaveLength(3);
      expect(teams[0].name).toBe('Eagles');
      expect(teams[0].score).toBe(0);
      expect(teams[0].id).toBeDefined();

      expect(teams[1].name).toBe('Tigers');
      expect(teams[1].score).toBe(50);
      expect(teams[1].color).toBe('#f00');

      expect(teams[2].name).toBe('Team 3');
      expect(teams[2].score).toBe(0);

      const configWithNonArray = {
        teams: 'Not an array',
      };
      const sanitizedNonArray = sanitizeAIConfig(
        'scoreboard' as WidgetType,
        configWithNonArray as unknown as Partial<WidgetConfig>
      ) as Record<string, unknown>;
      expect(sanitizedNonArray.teams).toBeUndefined();
    });

    it('sanitizes random config fields', () => {
      const configWithValidTypes = {
        lastResult: 'Winner',
        remainingStudents: ['Alice', 'Bob'],
      };
      const sanitizedValid = sanitizeAIConfig(
        'random' as WidgetType,
        configWithValidTypes as unknown as Partial<WidgetConfig>
      ) as RandomConfig;
      expect(sanitizedValid.lastResult).toBe('Winner');
      expect(sanitizedValid.remainingStudents).toEqual(['Alice', 'Bob']);

      const configWithInvalidTypes = {
        lastResult: 123,
        remainingStudents: 'Not an array',
      };
      const sanitizedInvalid = sanitizeAIConfig(
        'random' as WidgetType,
        configWithInvalidTypes as unknown as Partial<WidgetConfig>
      ) as Record<string, unknown>;
      expect(sanitizedInvalid.lastResult).toBeUndefined();
      expect(sanitizedInvalid.remainingStudents).toBeUndefined();

      const configWithMixedArrayTypes = {
        lastResult: ['Winner 1', 123, { object: true }, 'Winner 2'],
        remainingStudents: ['Alice', 456, 'Bob', null],
      };
      const sanitizedMixedArray = sanitizeAIConfig(
        'random' as WidgetType,
        configWithMixedArrayTypes as unknown as Partial<WidgetConfig>
      ) as RandomConfig;
      expect(sanitizedMixedArray.lastResult).toEqual(['Winner 1', 'Winner 2']);
      expect(sanitizedMixedArray.remainingStudents).toEqual(['Alice', 'Bob']);
    });
  });

  describe('validateGridConfig', () => {
    it('clamps values to valid ranges', () => {
      const input: GridPosition = {
        col: -1,
        row: 15,
        colSpan: 15,
        rowSpan: 5,
      };
      const validated = validateGridConfig(input);
      expect(validated).toEqual({
        col: 0,
        row: 11,
        colSpan: 12, // max available for col 0
        rowSpan: 1, // max available for row 11 (12-11)
      });
    });

    it('returns null for non-numeric values', () => {
      expect(
        validateGridConfig({ col: 'nan' } as unknown as GridPosition)
      ).toBeNull();
      expect(
        validateGridConfig({ row: undefined } as unknown as GridPosition)
      ).toBeNull();
    });

    it('handles floating point values by flooring', () => {
      const input: GridPosition = {
        col: 1.9,
        row: 2.1,
        colSpan: 4.5,
        rowSpan: 3.8,
      };
      const validated = validateGridConfig(input);
      expect(validated).toEqual({
        col: 1,
        row: 2,
        colSpan: 4,
        rowSpan: 3,
      });
    });
  });
});
