import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATES } from './mcp/boardEngine.gen';
import {
  normalizeTemplateLayout,
  readAllowedWidgets,
  templateLayoutSystemPrompt,
} from './boardTemplateLayout';

describe('normalizeTemplateLayout', () => {
  it('keeps a valid template answer', () => {
    expect(
      normalizeTemplateLayout({
        templateId: 'review-game',
        slots: [
          { zoneId: 'side', widgetType: 'scoreboard', config: {} },
          { zoneId: 'main', widgetType: 'poll', config: { question: 'Q?' } },
        ],
      })
    ).toEqual({
      templateId: 'review-game',
      slots: [
        { zoneId: 'side', widgetType: 'scoreboard', config: {} },
        { zoneId: 'main', widgetType: 'poll', config: { question: 'Q?' } },
      ],
    });
  });

  it('drops unknown zones, repeated zones, unknown widgets and bad configs', () => {
    expect(
      normalizeTemplateLayout({
        templateId: 'review-game',
        slots: [
          { zoneId: 'nowhere', widgetType: 'clock' },
          { zoneId: 'side', widgetType: 'not-a-widget' },
          { zoneId: 'side', widgetType: 'scoreboard', config: ['x'] },
          { zoneId: 'side', widgetType: 'clock', config: {} },
          'junk',
        ],
      })
    ).toEqual({
      templateId: 'review-game',
      slots: [{ zoneId: 'side', widgetType: 'scoreboard', config: {} }],
    });
  });

  it('drops widgets the teacher cannot use', () => {
    expect(
      normalizeTemplateLayout(
        {
          templateId: 'review-game',
          slots: [
            { zoneId: 'side', widgetType: 'scoreboard', config: {} },
            { zoneId: 'main', widgetType: 'poll', config: {} },
          ],
        },
        new Set(['poll'])
      )
    ).toEqual({
      templateId: 'review-game',
      slots: [{ zoneId: 'main', widgetType: 'poll', config: {} }],
    });
  });

  it('refuses unknown templates and answers with nothing usable', () => {
    expect(normalizeTemplateLayout({ templateId: 'nope', slots: [] })).toBe(
      null
    );
    expect(normalizeTemplateLayout({ widgets: [] })).toBe(null);
    expect(
      normalizeTemplateLayout({
        templateId: 'launch',
        slots: [{ zoneId: 'main', widgetType: 'bogus' }],
      })
    ).toBe(null);
  });
});

describe('templateLayoutSystemPrompt', () => {
  it('lists every template and its zones', () => {
    const prompt = templateLayoutSystemPrompt();
    for (const template of BOARD_TEMPLATES) {
      expect(prompt).toContain(`templateId "${template.id}"`);
      for (const slot of template.slots) {
        expect(prompt).toContain(`zoneId "${slot.zoneId}"`);
      }
    }
  });
});

describe('readAllowedWidgets', () => {
  it('is null when the caller sends no list', () => {
    expect(readAllowedWidgets(undefined)).toBe(null);
    expect(readAllowedWidgets(null)).toBe(null);
  });

  it('keeps known widget types only', () => {
    expect(readAllowedWidgets(['poll', 'made-up', 7, 'clock'])).toEqual(
      new Set(['poll', 'clock'])
    );
  });

  it('refuses a list that is not an array or is too long', () => {
    expect(() => readAllowedWidgets('poll')).toThrow();
    expect(() => readAllowedWidgets(Array(201).fill('poll'))).toThrow();
  });

  it('refuses a list with no usable widget', () => {
    expect(() => readAllowedWidgets([])).toThrow();
    expect(() => readAllowedWidgets(['made-up'])).toThrow();
  });
});

describe('templateLayoutSystemPrompt with allowed widgets', () => {
  it('offers only the allowed widgets and suggestions', () => {
    const prompt = templateLayoutSystemPrompt(new Set(['poll', 'text']));
    expect(prompt).toContain('- poll: Multiple choice poll');
    expect(prompt).not.toContain('- clock: Digital/analog clock');
    expect(prompt).not.toContain('scoreboard,');
    expect(prompt).not.toMatch(/suggested: [^)]*time-tool/);
    expect(prompt).toMatch(/suggested: [^)]*poll/);
  });

  it('offers every widget without a list', () => {
    expect(templateLayoutSystemPrompt()).toContain(
      '- clock: Digital/analog clock'
    );
  });
});
