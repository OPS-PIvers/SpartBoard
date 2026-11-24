import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
const STABLE_BUILDINGS = [{ id: 'b1', name: 'Building One' }];
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => STABLE_BUILDINGS,
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/googleCalendarService', () => ({
  GoogleCalendarService: class {
    getEvents = vi.fn().mockResolvedValue([]);
  },
}));

import { CalendarConfigurationModal } from '@/components/admin/CalendarConfigurationModal';

describe('CalendarConfigurationModal number fields', () => {
  it('lets the sync-frequency field be cleared and retyped', async () => {
    const user = userEvent.setup();
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(
        'input[type="number"][max="24"]'
      );
      expect(el).not.toBeNull();
      return el as HTMLInputElement;
    });
    await user.clear(input);
    expect(input).toHaveValue(null);
    await user.type(input, '12');
    expect(input).toHaveValue(12);
  });

  it('lets the days-visible field be cleared and retyped', async () => {
    const user = userEvent.setup();
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(
        'input[type="number"][max="30"]'
      );
      expect(el).not.toBeNull();
      return el as HTMLInputElement;
    });
    await user.clear(input);
    expect(input).toHaveValue(null);
    await user.type(input, '14');
    expect(input).toHaveValue(14);
  });
});
