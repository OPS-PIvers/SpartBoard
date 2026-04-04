import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  getTitle,
  getDefaultWidgetConfig,
  isWidgetLayout,
  createBoardSnapshot,
} from './widgetHelpers';
import {
  WidgetData,
  TimeToolConfig,
  WidgetType,
  ChecklistConfig,
  FeaturePermission,
  WidgetLayout,
  WidgetOutput,
  CatalystInstructionConfig,
  CatalystVisualConfig,
  QuizConfig,
} from '@/types';

describe('widgetHelpers', () => {
  describe('isWidgetLayout', () => {
    it('returns true for a valid WidgetLayout object', () => {
      const layout: WidgetLayout = { content: 'test content' };
      expect(isWidgetLayout(layout)).toBe(true);
    });

    it('returns true for a valid layout object with header', () => {
      const output: WidgetOutput = {
        content: 'hello',
        header: 'header',
      };
      expect(isWidgetLayout(output)).toBe(true);
    });

    it('returns false for React elements', () => {
      const element = React.createElement('div', null, 'hello');
      expect(isWidgetLayout(element as unknown as WidgetOutput)).toBe(false);
    });

    it('returns false for null/undefined/string', () => {
      expect(isWidgetLayout(null as unknown as WidgetOutput)).toBe(false);
      expect(isWidgetLayout('string' as unknown as WidgetOutput)).toBe(false);
    });

    it('returns false for an object without content property', () => {
      const obj = { someOtherProp: 'test' };
      expect(isWidgetLayout(obj as unknown as WidgetOutput)).toBe(false);
    });
  });

  describe('getTitle', () => {
    it('returns custom title if present', () => {
      const widget = {
        customTitle: 'My Title',
        type: 'time-tool',
      } as WidgetData;
      expect(getTitle(widget)).toBe('My Title');
    });

    it('returns admin displayName if present and no customTitle', () => {
      const widget = { type: 'calendar' } as WidgetData;
      const permission = {
        displayName: 'District Calendar',
      } as FeaturePermission;
      expect(getTitle(widget, permission)).toBe('District Calendar');
    });

    it('prioritizes customTitle over admin displayName', () => {
      const widget = {
        type: 'calendar',
        customTitle: 'Teacher Title',
      } as WidgetData;
      const permission = {
        displayName: 'District Calendar',
      } as FeaturePermission;
      expect(getTitle(widget, permission)).toBe('Teacher Title');
    });

    it('returns "Noise Meter" for sound widget', () => {
      const widget = { type: 'sound' } as WidgetData;
      expect(getTitle(widget)).toBe('Noise Meter');
    });

    it('returns "Task List" for checklist widget', () => {
      const widget = { type: 'checklist' } as WidgetData;
      expect(getTitle(widget)).toBe('Task List');
    });

    it('returns "App Manager" for miniApp widget', () => {
      const widget = { type: 'miniApp' } as WidgetData;
      expect(getTitle(widget)).toBe('App Manager');
    });

    it('returns "Notebook Viewer" for smartNotebook widget', () => {
      const widget = { type: 'smartNotebook' } as WidgetData;
      expect(getTitle(widget)).toBe('Notebook Viewer');
    });

    it.each([
      { type: 'random', expectedTitle: 'Selector' },
      { type: 'expectations', expectedTitle: 'Expectations' },
      { type: 'calendar', expectedTitle: 'Class Events' },
      { type: 'lunchCount', expectedTitle: 'Lunch Orders' },
      { type: 'classes', expectedTitle: 'Class Roster' },
      { type: 'sticker', expectedTitle: 'Sticker' },
      { type: 'seating-chart', expectedTitle: 'Seating Chart' },
      { type: 'talking-tool', expectedTitle: 'Talking Tool' },
    ])(
      'returns "$expectedTitle" for $type widget',
      ({ type, expectedTitle }) => {
        const widget = { type } as WidgetData;
        expect(getTitle(widget)).toBe(expectedTitle);
      }
    );

    it('returns correct title for catalyst-instruction widget', () => {
      const widget1 = {
        type: 'catalyst-instruction',
        config: { title: 'My Guide' } as CatalystInstructionConfig,
      } as WidgetData;
      expect(getTitle(widget1)).toBe('Guide: My Guide');

      const widget2 = {
        type: 'catalyst-instruction',
        config: {} as CatalystInstructionConfig,
      } as WidgetData;
      expect(getTitle(widget2)).toBe('Guide: Instruction Guide');
    });

    it('returns correct title for catalyst-visual widget', () => {
      const widget1 = {
        type: 'catalyst-visual',
        config: { title: 'My Anchor' } as CatalystVisualConfig,
      } as WidgetData;
      expect(getTitle(widget1)).toBe('My Anchor');

      const widget2 = {
        type: 'catalyst-visual',
        config: {} as CatalystVisualConfig,
      } as WidgetData;
      expect(getTitle(widget2)).toBe('Visual Anchor');
    });

    it('returns correct title for quiz widget', () => {
      const widget1 = {
        type: 'quiz',
        config: { selectedQuizTitle: 'Math 101' } as QuizConfig,
      } as WidgetData;
      expect(getTitle(widget1)).toBe('Quiz: Math 101');

      const widget2 = { type: 'quiz', config: {} as QuizConfig } as WidgetData;
      expect(getTitle(widget2)).toBe('Quiz');
    });

    it('returns "Starter Pack" for starter-pack widget', () => {
      const widget = { type: 'starter-pack' } as WidgetData;
      expect(getTitle(widget)).toBe('Starter Pack');
    });

    it('returns "Timer" for time-tool widget', () => {
      const widget = { type: 'time-tool' } as WidgetData;
      expect(getTitle(widget)).toBe('Timer');
    });

    it('returns capitalized type for other widgets', () => {
      const widget = { type: 'clock' } as WidgetData;
      expect(getTitle(widget)).toBe('Clock');
    });

    it('handles empty or null customTitle by falling back to type-based title', () => {
      const widget1 = { customTitle: '', type: 'clock' } as WidgetData;
      const widget2 = {
        customTitle: null,
        type: 'clock',
      } as unknown as WidgetData;
      expect(getTitle(widget1)).toBe('Clock');
      expect(getTitle(widget2)).toBe('Clock');
    });
  });

  describe('getDefaultWidgetConfig', () => {
    it('returns correct defaults for time-tool', () => {
      const config = getDefaultWidgetConfig('time-tool') as TimeToolConfig;
      expect(config.mode).toBe('timer');
    });

    it('returns correct defaults for miniApp', () => {
      const config = getDefaultWidgetConfig('miniApp');
      expect(config).toHaveProperty('activeApp', null);
    });

    it('returns correct defaults for smartNotebook', () => {
      const config = getDefaultWidgetConfig('smartNotebook');
      expect(config).toHaveProperty('activeNotebookId', null);
    });

    it('returns correct defaults for checklist', () => {
      const config = getDefaultWidgetConfig('checklist');
      expect(config).toEqual({
        items: [],
        mode: 'manual',
        firstNames: '',
        lastNames: '',
        completedNames: [],
        scaleMultiplier: 1,
      });
    });

    it('returns an empty object when default config is missing or undefined', async () => {
      const { WIDGET_DEFAULTS } = await import('@/config/widgetDefaults');
      const { getDefaultWidgetConfig: localGetDefaultWidgetConfig } =
        await import('@/utils/widgetHelpers');

      const originalClock = WIDGET_DEFAULTS['clock'];
      try {
        WIDGET_DEFAULTS['clock'] = { w: 100, h: 100 };
        const config = localGetDefaultWidgetConfig('clock');
        expect(config).toEqual({});
      } finally {
        WIDGET_DEFAULTS['clock'] = originalClock;
      }
    });

    it('returns empty object for traffic', () => {
      const config = getDefaultWidgetConfig('traffic');
      expect(config).toEqual({});
    });

    it('returns a deep copy to prevent shared state mutations', () => {
      const config1 = getDefaultWidgetConfig('checklist') as ChecklistConfig;
      const config2 = getDefaultWidgetConfig('checklist');

      config1.items.push({ id: '1', text: 'New Item', completed: false });

      expect(config2).toEqual({
        items: [],
        mode: 'manual',
        firstNames: '',
        lastNames: '',
        completedNames: [],
        scaleMultiplier: 1,
      });
    });

    it('returns defaults for all supported widget types', () => {
      const types: WidgetType[] = [
        'clock',
        'traffic',
        'text',
        'checklist',
        'random',
        'dice',
        'sound',
        'drawing',
        'qr',
        'embed',
        'poll',
        'webcam',
        'scoreboard',
        'expectations',
        'weather',
        'schedule',
        'calendar',
        'lunchCount',
        'classes',
        'instructionalRoutines',
        'time-tool',
        'miniApp',
      ];
      types.forEach((type) => {
        const config = getDefaultWidgetConfig(type);
        expect(config).toBeDefined();
        expect(typeof config).toBe('object');
      });
    });
  });

  describe('createBoardSnapshot', () => {
    it('creates a board snapshot by omitting ids and cloning configs', () => {
      const widgets: WidgetData[] = [
        {
          id: 'widget-1',
          type: 'text',
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          config: { content: 'hello' },
        } as unknown as WidgetData,
      ];

      const snapshot = createBoardSnapshot(widgets);

      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]).not.toHaveProperty('id');
      expect(snapshot[0].type).toBe('text');
      expect(snapshot[0].config).toEqual({ content: 'hello' });

      // Ensure config is deeply cloned
      expect(snapshot[0].config).not.toBe(widgets[0].config);
    });
  });
});
