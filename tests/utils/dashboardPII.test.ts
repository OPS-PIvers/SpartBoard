import { describe, it, expect } from 'vitest';
import {
  scrubDashboardPII,
  extractDashboardPII,
  mergeDashboardPII,
  dashboardHasPII,
  DashboardPiiSupplement,
} from '../../utils/dashboardPII';
import { Dashboard } from '../../types';

describe('dashboardPII utilities', () => {
  const mockDashboard = {
    id: 'test-dash',
    name: 'Test Dashboard',
    isShared: false,
    widgets: [
      {
        id: 'widget-1',
        type: 'random',
        position: { x: 0, y: 0 },
        config: {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
          otherConfig: 'safe-value',
        },
      },
      {
        id: 'widget-2',
        type: 'text',
        position: { x: 10, y: 10 },
        config: {
          text: 'Hello world',
        },
      },
      {
        id: 'widget-3',
        type: 'seating-chart',
        position: { x: 20, y: 20 },
        config: {
          names: ['Charlie', 'Dave'],
          layout: 'grid',
        },
      },
    ],
  } as unknown as Dashboard;

  describe('dashboardHasPII', () => {
    it('returns true if any widget contains PII fields', () => {
      expect(dashboardHasPII(mockDashboard)).toBe(true);
    });

    it('returns false if no widget contains PII fields', () => {
      const safeDashboard = {
        ...mockDashboard,
        widgets: [
          {
            id: 'safe-widget',
            type: 'text',
            position: { x: 0, y: 0 },
            config: { text: 'No PII here' },
          },
        ],
      } as unknown as Dashboard;
      expect(dashboardHasPII(safeDashboard)).toBe(false);
    });
  });

  describe('extractDashboardPII', () => {
    it('extracts only PII fields and groups them by widget ID', () => {
      const supplement = extractDashboardPII(mockDashboard);

      expect(supplement).toEqual({
        'widget-1': {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
        },
        'widget-3': {
          names: ['Charlie', 'Dave'],
        },
      });

      // Ensure safe widgets are not included
      expect(supplement['widget-2']).toBeUndefined();
    });
  });

  describe('scrubDashboardPII', () => {
    it('removes PII fields from widget configs without modifying other fields', () => {
      const scrubbed = scrubDashboardPII(mockDashboard);

      expect(scrubbed.widgets[0].config).toEqual({
        otherConfig: 'safe-value',
      });

      expect(scrubbed.widgets[1].config).toEqual({
        text: 'Hello world',
      });

      expect(scrubbed.widgets[2].config).toEqual({
        layout: 'grid',
      });

      // Original should remain unchanged
      expect(mockDashboard.widgets[0].config).toHaveProperty('firstNames');
    });
  });

  describe('mergeDashboardPII', () => {
    it('merges PII fields back into the appropriate widget configs', () => {
      const scrubbed = scrubDashboardPII(mockDashboard);
      const supplement: DashboardPiiSupplement = {
        'widget-1': {
          firstNames: 'Alice\nBob',
          lastNames: 'Smith\nJones',
        },
        'widget-3': {
          names: ['Charlie', 'Dave'],
        },
      };

      const merged = mergeDashboardPII(scrubbed, supplement);

      expect(merged.widgets[0].config).toEqual({
        otherConfig: 'safe-value',
        firstNames: 'Alice\nBob',
        lastNames: 'Smith\nJones',
      });

      expect(merged.widgets[1].config).toEqual({
        text: 'Hello world',
      });

      expect(merged.widgets[2].config).toEqual({
        layout: 'grid',
        names: ['Charlie', 'Dave'],
      });
    });

    it('handles widgets that exist in dashboard but not in supplement', () => {
      const supplement: DashboardPiiSupplement = {
        'widget-1': {
          firstNames: 'Alice\nBob',
        },
      };

      const merged = mergeDashboardPII(mockDashboard, supplement);
      expect(merged.widgets[1].config).toEqual(mockDashboard.widgets[1].config);
    });
  });
});
