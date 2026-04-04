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
} from '../types';

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

    it('returns capitalized type for other widgets', () => {
      const widget = { type: 'clock' } as WidgetData;
      expect(getTitle(widget)).toBe('Clock');
    });

    it('returns "Selector" for random widget', () => {
      const widget = { type: 'random' } as WidgetData;
      expect(getTitle(widget)).toBe('Selector');
    });

    it('returns "Expectations" for expectations widget', () => {
      const widget = { type: 'expectations' } as WidgetData;
      expect(getTitle(widget)).toBe('Expectations');
    });

    it('returns "Lunch Orders" for lunchCount widget', () => {
      const widget = { type: 'lunchCount' } as WidgetData;
      expect(getTitle(widget)).toBe('Lunch Orders');
    });

    it('returns "Class Roster" for classes widget', () => {
      const widget = { type: 'classes' } as WidgetData;
      expect(getTitle(widget)).toBe('Class Roster');
    });

    it('returns "Sticker" for sticker widget', () => {
      const widget = { type: 'sticker' } as WidgetData;
      expect(getTitle(widget)).toBe('Sticker');
    });

    it('returns "Seating Chart" for seating-chart widget', () => {
      const widget = { type: 'seating-chart' } as WidgetData;
      expect(getTitle(widget)).toBe('Seating Chart');
    });

    it('returns "Talking Tool" for talking-tool widget', () => {
      const widget = { type: 'talking-tool' } as WidgetData;
      expect(getTitle(widget)).toBe('Talking Tool');
    });

    it('handles catalyst-instruction with and without config title', () => {
      const widgetWithTitle = {
        type: 'catalyst-instruction',
        config: { title: 'Math Guide' },
      } as WidgetData;
      const widgetWithoutTitle = {
        type: 'catalyst-instruction',
        config: {},
      } as WidgetData;
      expect(getTitle(widgetWithTitle)).toBe('Guide: Math Guide');
      expect(getTitle(widgetWithoutTitle)).toBe('Guide: Instruction Guide');
    });

    it('handles catalyst-visual with and without config title', () => {
      const widgetWithTitle = {
        type: 'catalyst-visual',
        config: { title: 'Daily Goal' },
      } as WidgetData;
      const widgetWithoutTitle = {
        type: 'catalyst-visual',
        config: {},
      } as WidgetData;
      expect(getTitle(widgetWithTitle)).toBe('Daily Goal');
      expect(getTitle(widgetWithoutTitle)).toBe('Visual Anchor');
    });

    it('handles quiz with and without selectedQuizTitle', () => {
      const widgetWithTitle = {
        type: 'quiz',
        config: { selectedQuizTitle: 'Math 101' },
      } as WidgetData;
      const widgetWithoutTitle = { type: 'quiz', config: {} } as WidgetData;
      expect(getTitle(widgetWithTitle)).toBe('Quiz: Math 101');
      expect(getTitle(widgetWithoutTitle)).toBe('Quiz');
    });

    it('returns "Starter Pack" for starter-pack widget', () => {
      const widget = { type: 'starter-pack' } as WidgetData;
      expect(getTitle(widget)).toBe('Starter Pack');
    });

    it('returns "Class Events" for calendar widget', () => {
      const widget = { type: 'calendar' } as WidgetData;
      expect(getTitle(widget)).toBe('Class Events');
    });

    it('returns "Timer" for time-tool widget', () => {
      const widget = { type: 'time-tool' } as WidgetData;
      expect(getTitle(widget)).toBe('Timer');
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
    it('removes id from widgets and deeply clones their config', () => {
      const widgets: WidgetData[] = [
        {
          id: 'w1',
          type: 'text',
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          z: 1,
          isLocked: false,
          flipped: false,
          config: { content: 'test', html: '<p>test</p>' },
        },
        {
          id: 'w2',
          type: 'clock',
          x: 2,
          y: 2,
          w: 2,
          h: 2,
          z: 2,
          isLocked: false,
          flipped: false,
          config: {},
        },
      ] as WidgetData[];

      const snapshot = createBoardSnapshot(widgets);

      // Verify id is removed
      expect(snapshot[0]).not.toHaveProperty('id');
      expect(snapshot[1]).not.toHaveProperty('id');

      // Verify other props remain
      expect(snapshot[0]).toMatchObject({
        type: 'text',
        x: 0,
        y: 0,
        w: 2,
        h: 2,
        z: 1,
        isLocked: false,
        flipped: false,
      });

      // Verify config is cloned, not referenced
      expect(snapshot[0].config).toEqual({
        content: 'test',
        html: '<p>test</p>',
      });
      (snapshot[0].config as { content: string }).content = 'updated';
      expect(widgets[0].config).toEqual({
        content: 'test',
        html: '<p>test</p>',
      }); // original unchanged
    });
  });
});
