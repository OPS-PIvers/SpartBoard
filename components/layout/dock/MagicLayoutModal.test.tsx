import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MagicLayoutModal } from '@/components/layout/dock/MagicLayoutModal';

const generate = vi.hoisted(() => vi.fn());

vi.mock('@/utils/ai', () => ({
  generateDashboardLayout: generate,
  buildPromptWithFileContext: (d: string) => d,
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addWidgets: vi.fn(), addToast: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => false,
    canAccessWidget: () => true,
  }),
}));
interface OutwardMock {
  locked: boolean;
  active: boolean;
  confirm?: () => Promise<boolean>;
}
const outwardMock = vi.hoisted((): { value: OutwardMock } => ({
  value: { locked: false, active: false },
}));
vi.mock('@/hooks/useViewAsOutward', () => ({
  useViewAsOutward: () => outwardMock.value,
}));

describe('MagicLayoutModal Enter', () => {
  afterEach(() => {
    outwardMock.value = { locked: false, active: false };
  });

  it('does not start a second generation while one is in flight', () => {
    generate.mockReturnValue(new Promise(() => undefined));
    render(<MagicLayoutModal onClose={vi.fn()} />);
    const box = screen.getByPlaceholderText(/Math rotations/);
    fireEvent.change(box, { target: { value: 'Morning meeting' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('runs once when Enter repeats while the View As confirm is pending', async () => {
    generate.mockReset();
    generate.mockReturnValue(new Promise(() => undefined));
    let accept: (v: boolean) => void = () => undefined;
    const confirm = vi.fn(() => new Promise<boolean>((r) => (accept = r)));
    outwardMock.value = { locked: false, active: true, confirm };
    render(<MagicLayoutModal onClose={vi.fn()} />);
    const box = screen.getByPlaceholderText(/Math rotations/);
    fireEvent.change(box, { target: { value: 'Morning meeting' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(confirm).toHaveBeenCalledTimes(1);
    accept(true);
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  });

  it('allows another try after a declined confirm', async () => {
    generate.mockReset();
    const confirm = vi.fn().mockResolvedValue(false);
    outwardMock.value = { locked: false, active: true, confirm };
    render(<MagicLayoutModal onClose={vi.fn()} />);
    const box = screen.getByPlaceholderText(/Math rotations/);
    fireEvent.change(box, { target: { value: 'Morning meeting' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(generate).not.toHaveBeenCalled();
  });
});
