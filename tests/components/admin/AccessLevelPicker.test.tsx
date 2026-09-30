import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessLevelPicker } from '@/components/admin/access/AccessFeatureRow';

describe('AccessLevelPicker', () => {
  it('exposes a radiogroup with the current level checked', () => {
    render(<AccessLevelPicker value="beta" onChange={vi.fn()} label="Quiz" />);
    expect(
      screen.getByRole('radiogroup', { name: 'Quiz access' })
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'Admin' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('selects on click and on arrow-key navigation', () => {
    const onChange = vi.fn();
    render(
      <AccessLevelPicker value="admin" onChange={onChange} label="Quiz" />
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Public' }));
    expect(onChange).toHaveBeenLastCalledWith('public');
    const admin = screen.getByRole('radio', { name: 'Admin' });
    admin.focus();
    fireEvent.keyDown(admin, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('beta');
  });
});
