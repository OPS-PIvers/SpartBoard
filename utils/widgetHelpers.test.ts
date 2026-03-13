import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  getTitle,
  getDefaultWidgetConfig,
  isWidgetLayout,
  calculatePinchScale,
  calculatePinchOrigin,
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

  describe('calculatePinchScale', () => {
    it('returns null for invalid inputs', () => {
      expect(calculatePinchScale(0, 1.5)).toBe(null);
      expect(calculatePinchScale(-1, 1.5)).toBe(null);
      expect(calculatePinchScale(1, NaN)).toBe(null);
      expect(calculatePinchScale(1, Infinity)).toBe(null);
    });

    it('scales up and clamps at 3x', () => {
      const result = calculatePinchScale(1, 4);
      expect(result?.newScaleMultiplier).toBe(3);
      expect(result?.relativeScale).toBe(3);
    });

    it('scales down and clamps at 0.5x', () => {
      const result = calculatePinchScale(1, 0.2);
      expect(result?.newScaleMultiplier).toBe(0.5);
      expect(result?.relativeScale).toBe(0.5);
    });

    it('calculates relative scale correctly from 2x base', () => {
      // Starting at 2x zoom, zoom in by another 1.2x -> 2.4x
      const result = calculatePinchScale(2, 1.2);
      expect(result?.newScaleMultiplier).toBe(2.4);
      expect(result?.relativeScale).toBe(1.2);
    });

    it('handles clamping correctly when starting at bounds', () => {
      // Already at 3x, zooming in more
      const resultIn = calculatePinchScale(3, 1.5);
      expect(resultIn?.newScaleMultiplier).toBe(3);
      expect(resultIn?.relativeScale).toBe(1);

      // Already at 0.5x, zooming out more
      const resultOut = calculatePinchScale(0.5, 0.5);
      expect(resultOut?.newScaleMultiplier).toBe(0.5);
      expect(resultOut?.relativeScale).toBe(1);
    });
  });

  describe('calculatePinchOrigin', () => {
    const mockRect = {
      left: 100,
      top: 100,
      width: 400,
      height: 400,
    } as DOMRect;

    it('returns 50,50 for less than 2 touches', () => {
      expect(calculatePinchOrigin([], mockRect)).toEqual({ x: 50, y: 50 });
      expect(
        calculatePinchOrigin([{ clientX: 0, clientY: 0 }], mockRect)
      ).toEqual({ x: 50, y: 50 });
    });

    it('calculates midpoint relative to rect', () => {
      // Fingers at (100, 100) and (200, 200) -> Midpoint (150, 150)
      // Relative to rect starting at (100, 100) -> Midpoint is (50, 50)
      // In 400x400 rect, (50, 50) is (12.5%, 12.5%)
      const touches = [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 200 },
      ];
      const result = calculatePinchOrigin(touches, mockRect);
      expect(result.x).toBe(12.5);
      expect(result.y).toBe(12.5);
    });

    it('clamps origin to 0-100%', () => {
      const touches = [
        { clientX: 0, clientY: 0 },
        { clientX: 50, clientY: 50 },
      ];
      const result = calculatePinchOrigin(touches, mockRect);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
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
