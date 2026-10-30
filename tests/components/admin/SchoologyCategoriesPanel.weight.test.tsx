import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ data: () => undefined }),
}));

import { SchoologyCategoriesPanel } from '@/components/admin/SchoologyCategoriesPanel';

describe('SchoologyCategoriesPanel weight field', () => {
  it('stays empty while the admin clears it to retype', async () => {
    render(<SchoologyCategoriesPanel />);
    const input =
      await screen.findByLabelText<HTMLInputElement>('Category 1 weight');
    expect(input.value).toBe('20');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '30' } });
    expect(input.value).toBe('30');
    fireEvent.blur(input);
    expect(input.value).toBe('30');
  });
});
