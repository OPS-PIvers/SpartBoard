import React from 'react';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CalendarConfigurationModal } from './CalendarConfigurationModal';
import type { Building } from '@/config/buildings';
import { getDoc, setDoc, type DocumentSnapshot } from 'firebase/firestore';

vi.mock('lucide-react', () => {
  function icon(name: string) {
    const Stub = (props: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { 'data-icon': name, ...props });
    Stub.displayName = name;
    return Stub;
  }
  const mocks: Record<string, unknown> = {};
  return new Proxy(mocks, {
    get(target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && !(prop in target)) {
        target[prop] = icon(prop);
      }
      return target[prop as string];
    },
  });
});

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: vi.fn().mockResolvedValue(null) }),
}));

const buildings: Building[] = [
  { id: 'high', name: 'High', gradeLevels: ['9-12'], gradeLabel: '9-12' },
];
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => buildings,
}));

describe('CalendarConfigurationModal sync frequency', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(getDoc).mockReset();
    vi.mocked(setDoc).mockReset();
  });

  it('keeps the saved frequency finite when the hours field is cleared', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocumentSnapshot);
    vi.mocked(setDoc).mockResolvedValue(undefined);

    render(<CalendarConfigurationModal isOpen onClose={vi.fn()} />);
    const input = await screen.findByDisplayValue('4');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => expect(setDoc).toHaveBeenCalled());
    const payload = vi.mocked(setDoc).mock.calls[0][1] as {
      config: { updateFrequencyHours: number };
    };
    expect(Number.isFinite(payload.config.updateFrequencyHours)).toBe(true);
  });

  it('clamps the sync frequency to the 1-24 hour range', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocumentSnapshot);
    vi.mocked(setDoc).mockResolvedValue(undefined);

    render(<CalendarConfigurationModal isOpen onClose={vi.fn()} />);
    const input = await screen.findByDisplayValue('4');
    fireEvent.change(input, { target: { value: '0' } });
    expect((input as HTMLInputElement).value).toBe('1');
    fireEvent.change(input, { target: { value: '99' } });
    expect((input as HTMLInputElement).value).toBe('24');
  });
});

describe('CalendarConfigurationModal failed load', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(getDoc).mockReset();
    vi.mocked(setDoc).mockReset();
  });

  it('shows an error with retry instead of editable defaults when the read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('unavailable'));
    render(<CalendarConfigurationModal isOpen onClose={vi.fn()} />);

    await screen.findByRole('alert');
    const save = screen.getByText('Save Configuration').closest('button');
    expect(save).toBeDisabled();
    expect(screen.queryByDisplayValue('4')).toBeNull();

    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        config: { blockedDates: ['2026-12-25'], updateFrequencyHours: 6 },
      }),
    } as unknown as DocumentSnapshot);
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByDisplayValue('6')).toBeTruthy();
    expect(setDoc).not.toHaveBeenCalled();
  });
});
