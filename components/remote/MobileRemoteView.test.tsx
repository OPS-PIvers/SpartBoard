import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileRemoteView } from './MobileRemoteView';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const makeWidget = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'scoreboard',
  z: 1,
  config: {},
  ...overrides,
});

const makeDashboard = (widgets: ReturnType<typeof makeWidget>[]) => ({
  id: 'board-123',
  name: 'Board 123',
  widgets,
  settings: {},
});

describe('MobileRemoteView', () => {
  const mockedUseDashboard = useDashboard as unknown as ReturnType<
    typeof vi.fn
  >;
  const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://spart.test/remote'),
    });
    mockedUseAuth.mockReturnValue({ remoteControlEnabled: true });
  });

  const dashboardCtx = (dashboard: ReturnType<typeof makeDashboard>) => ({
    activeDashboard: dashboard,
    updateWidget: vi.fn(),
    updateDashboardSettings: vi.fn(),
    loadDashboard: vi.fn(),
    dashboards: [dashboard],
  });

  it('renders a Connected status chip', () => {
    mockedUseDashboard.mockReturnValue(
      dashboardCtx(makeDashboard([makeWidget('w1')]))
    );
    render(<MobileRemoteView />);
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it('reflects a new context snapshot without a manual Sync tap', () => {
    const ctx = dashboardCtx(makeDashboard([makeWidget('w1')]));
    mockedUseDashboard.mockReturnValue(ctx);
    const { rerender } = render(<MobileRemoteView />);
    // Initially one widget card heading present.
    expect(screen.getAllByRole('button', { name: /spotlight/i })).toHaveLength(
      1
    );

    // Desktop adds a widget -> new snapshot from context.
    ctx.activeDashboard = makeDashboard([makeWidget('w1'), makeWidget('w2')]);
    mockedUseDashboard.mockReturnValue(ctx);
    rerender(<MobileRemoteView />);

    // Reflected automatically, no Sync tap.
    expect(screen.getAllByRole('button', { name: /spotlight/i })).toHaveLength(
      2
    );
  });
});
