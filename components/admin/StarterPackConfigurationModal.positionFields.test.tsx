import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StarterPackConfigurationModal } from './StarterPackConfigurationModal';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
}));

const dashboardValue = { activeDashboard: null, addToast: vi.fn() };
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => dashboardValue,
}));
const dialogValue = { showConfirm: vi.fn() };
vi.mock('@/context/useDialog', () => ({ useDialog: () => dialogValue }));

describe('StarterPackConfigurationModal position fields', () => {
  afterEach(cleanup);

  it('lets the new-widget X field be cleared and retyped', async () => {
    render(<StarterPackConfigurationModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('New Pack'));
    fireEvent.click(screen.getByText('Show Manual'));
    const x = document.querySelector(
      '[data-tour-field="newWidget-X"]'
    ) as HTMLInputElement;
    expect(x.value).toBe('100');
    fireEvent.change(x, { target: { value: '' } });
    expect(x.value).toBe('');
    fireEvent.change(x, { target: { value: '250' } });
    expect(x.value).toBe('250');
  });
});
