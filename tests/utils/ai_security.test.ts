import { describe, it, expect } from 'vitest';
import {
  validateGridConfig,
  validatePlacement,
  sanitizeAIConfig,
} from '@/utils/ai_security';
import {
  GridPosition,
  MiniAppConfig,
  EmbedConfig,
  TextConfig,
  PollConfig,
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
      const sanitized = sanitizeAIConfig('miniApp', config) as MiniAppConfig;
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
      const sanitized = sanitizeAIConfig('embed', config) as EmbedConfig;
      expect(
        (sanitized as unknown as Record<string, unknown>).html
      ).toBeUndefined();
      expect(sanitized.url).toBe('https://example.com/');
    });

    it('validates URLs in embed and qr widgets', () => {
      const maliciousEmbed = sanitizeAIConfig('embed', {
        url: 'javascript:alert(1)',
      }) as EmbedConfig;
      expect(maliciousEmbed.url).toBe('');

      const safeEmbed = sanitizeAIConfig('embed', {
        url: 'https://google.com',
      }) as EmbedConfig;
      expect(safeEmbed.url).toBe('https://google.com/');

      const maliciousQR = sanitizeAIConfig('qr', {
        url: 'data:text/html,xss',
      }) as unknown as Record<string, unknown>;
      expect(maliciousQR.url).toBe('');
    });

    it('clamps fontSize in text widget', () => {
      const tooSmall = sanitizeAIConfig('text', {
        content: 'hi',
        fontSize: 2,
      }) as TextConfig;
      expect(tooSmall.fontSize).toBe(8);

      const tooLarge = sanitizeAIConfig('text', {
        content: 'hi',
        fontSize: 500,
      }) as TextConfig;
      expect(tooLarge.fontSize).toBe(120);
    });

    it('sanitizes poll options', () => {
      const config = {
        question: '?',
        options: [{ label: 'Good', votes: 100 }, 'Bad', { label: 123 }],
      };
      const sanitized = sanitizeAIConfig('poll', config) as PollConfig;
      const sanitizedOptions = sanitized.options ?? [];
      expect(sanitizedOptions[0]).toEqual(
        expect.objectContaining({ label: 'Good', votes: 0 })
      );
      expect(sanitizedOptions[0].id).toBeDefined();
      expect(sanitizedOptions[1]).toEqual(
        expect.objectContaining({ label: 'Bad', votes: 0 })
      );
      expect(sanitizedOptions[1].id).toBeDefined();
      expect(sanitizedOptions[2]).toEqual(
        expect.objectContaining({ label: '123', votes: 0 })
      );
      expect(sanitizedOptions[2].id).toBeDefined();
    });

    it('sanitizes scoreboard teams', () => {
      const configWithArray = {
        teams: ['Eagles', { name: 'Tigers', score: 50, color: '#f00' }, 123],
      };
      const sanitizedArray = sanitizeAIConfig(
        'scoreboard',
        configWithArray
      ) as ScoreboardConfig;

      const teams = sanitizedArray.teams ?? [];
      expect(teams).toHaveLength(3);
      expect(teams[0].name).toBe('Eagles');
      expect(teams[0].score).toBe(0);
      expect(teams[0].id).toBeDefined();

      expect(teams[1].name).toBe('Tigers');
      expect(teams[1].score).toBe(50);
      expect(teams[1].color).toBe('#f00');

      expect(teams[2].name).toBe('Team C');
      expect(teams[2].score).toBe(0);

      const configWithNonArray = {
        teams: 'Not an array',
      };
      const sanitizedNonArray = sanitizeAIConfig(
        'scoreboard',
        configWithNonArray
      ) as Record<string, unknown>;
      expect(sanitizedNonArray.teams).toBeUndefined();
    });

    it('sanitizes random config fields', () => {
      const configWithValidTypes = {
        lastResult: 'Winner',
        remainingStudents: ['Alice', 'Bob'],
      };
      const sanitizedValid = sanitizeAIConfig(
        'random',
        configWithValidTypes
      ) as RandomConfig;
      expect(sanitizedValid.lastResult).toBe('Winner');
      expect(sanitizedValid.remainingStudents).toEqual(['Alice', 'Bob']);

      const configWithInvalidTypes = {
        lastResult: 123,
        remainingStudents: 'Not an array',
      };
      const sanitizedInvalid = sanitizeAIConfig(
        'random',
        configWithInvalidTypes
      ) as Record<string, unknown>;
      expect(sanitizedInvalid.lastResult).toBeUndefined();
      expect(sanitizedInvalid.remainingStudents).toBeUndefined();

      const configWithMixedArrayTypes = {
        lastResult: ['Winner 1', 123, { object: true }, 'Winner 2'],
        remainingStudents: ['Alice', 456, 'Bob', null],
      };
      const sanitizedMixedArray = sanitizeAIConfig(
        'random',
        configWithMixedArrayTypes
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

  describe('validatePlacement', () => {
    const zone = {
      xProp: 0.1,
      yProp: 0.2,
      wProp: 0.5,
      hProp: 0.6,
      aspectRatio: 1.5,
    };

    it('keeps a placement inside the board', () => {
      expect(validatePlacement(zone)).toEqual(zone);
      expect(validatePlacement(undefined)).toBeNull();
    });

    it('rejects placements off the board or without a size', () => {
      expect(validatePlacement({ ...zone, xProp: 0.6 })).toBeNull();
      expect(validatePlacement({ ...zone, yProp: -0.2 })).toBeNull();
      expect(validatePlacement({ ...zone, wProp: 0 })).toBeNull();
      expect(validatePlacement({ ...zone, hProp: Number.NaN })).toBeNull();
    });

    it('drops an implausible aspect ratio so the board shape decides it', () => {
      for (const aspectRatio of [Number.NaN, 1e9, 1e-9, -1]) {
        expect(
          validatePlacement({ ...zone, aspectRatio })?.aspectRatio
        ).toBeUndefined();
      }
    });
  });
});
