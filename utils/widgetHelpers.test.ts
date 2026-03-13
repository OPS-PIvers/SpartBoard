import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  getTitle,
  getDefaultWidgetConfig,
  isWidgetLayout,
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
});
