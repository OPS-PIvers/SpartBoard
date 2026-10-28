import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATES } from './mcp/boardEngine.gen';
import {
  normalizeTemplateLayout,
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
