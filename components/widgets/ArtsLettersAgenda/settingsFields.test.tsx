import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgendaVersionField } from './settingsFields';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { WidgetData } from '@/types';

const mockUpdateWidget = vi.fn();
vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ updateWidget: mockUpdateWidget }),
}));

const auth = vi.hoisted(() => ({
  featurePermissions: [] as unknown[],
  selectedBuildings: ['schumann'],
}));
vi.mock('@/context/useAuth', () => ({ useAuth: () => auth }));

const labels: Record<string, string> = {
  'widgetSettings.arts-letters-agenda.version': 'Version',
  'widgetSettings.arts-letters-agenda.simple': 'Simple',
  'widgetSettings.arts-letters-agenda.detailed': 'Detailed',
  'widgetSettings.arts-letters-agenda.sameLists':
    'Detailed matches Simple until your school sets its own list.',
};

const makeCtx = (h: number, config: Record<string, unknown> = {}) => {
  const widget = {
    id: 'agenda-1',
    type: 'arts-letters-agenda',
    x: 0,
    y: 0,
    w: 420,
    h,
    z: 1,
    flipped: true,
    config,
  } as WidgetData;
  return {
    config,
    widget,
    isAdmin: true,
    canAccessFeature: () => true,
    t: (key: string) => labels[key] ?? key,
    updateConfig: vi.fn(),
    id: 'version-field',
    labelId: 'version-label',
  } as CustomRenderCtx;
};

const withDetailed = (count: number) => {
  auth.featurePermissions = [
    {
      widgetType: 'arts-letters-agenda',
      config: {
        buildingDefaults: {
          schumann: {
            buildingId: 'schumann',
            detailedParts: Array.from({ length: count }, (_, i) => ({
              id: `p${i}`,
              label: `Step ${i + 1}`,
            })),
          },
        },
      },
    },
  ];
};

describe('AgendaVersionField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.featurePermissions = [];
  });

  it('starts on Simple and switches the version', () => {
    withDetailed(4);
    render(<AgendaVersionField ctx={makeCtx(500)} />);
    expect(screen.getByRole('radio', { name: 'Simple' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Detailed' }));
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: { version: 'detailed' },
    });
  });

  it('makes a short widget taller so every Detailed step fits', () => {
    withDetailed(6);
    render(<AgendaVersionField ctx={makeCtx(300)} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Detailed' }));
    expect(mockUpdateWidget).toHaveBeenCalledWith('agenda-1', {
      config: { version: 'detailed' },
      h: 606,
    });
  });

  it('never shrinks a widget that is already tall enough', () => {
    withDetailed(5);
    render(<AgendaVersionField ctx={makeCtx(900)} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Detailed' }));
    expect(mockUpdateWidget.mock.calls[0][1]).not.toHaveProperty('h');
  });

  it('says Detailed matches Simple until a list is set', () => {
    render(<AgendaVersionField ctx={makeCtx(500)} />);
    expect(
      screen.getByText(
        'Detailed matches Simple until your school sets its own list.'
      )
    ).toBeInTheDocument();
  });
});
