import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from '@/components/common/SegmentedControl';

const OPTIONS = [
  { value: 'settings', label: 'Settings' },
  { value: 'style', label: 'Style' },
] as const;

describe('SegmentedControl', () => {
  it('marks the active option with aria-selected', () => {
    render(
      <SegmentedControl
        value="settings"
        onChange={vi.fn()}
        options={[...OPTIONS]}
      />
    );
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('fires onChange with the option value on click', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="settings"
        onChange={onChange}
        options={[...OPTIONS]}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(onChange).toHaveBeenCalledWith('style');
  });

  it('applies roving tabindex: selected tab has tabIndex=0, others -1', () => {
    render(
      <SegmentedControl
        value="settings"
        onChange={vi.fn()}
        options={[...OPTIONS]}
      />
    );
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByRole('tab', { name: 'Style' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('moves focus AND fires onChange on ArrowRight/ArrowLeft/Home/End (select-follows-focus)', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="settings"
        onChange={onChange}
        options={[...OPTIONS]}
      />
    );
    const first = screen.getByRole('tab', { name: 'Settings' });
    const second = screen.getByRole('tab', { name: 'Style' });

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('style');

    fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('settings');

    fireEvent.keyDown(first, { key: 'End' });
    expect(second).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('style');

    fireEvent.keyDown(second, { key: 'Home' });
    expect(first).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('settings');
  });

  it('ignores arrow keys with a modifier held', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="settings"
        onChange={onChange}
        options={[...OPTIONS]}
      />
    );
    const first = screen.getByRole('tab', { name: 'Settings' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight', shiftKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(first).toHaveFocus();
  });

  it('renders as a radiogroup with aria-checked radios when asked, arrows still selecting', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="settings"
        onChange={onChange}
        options={[...OPTIONS]}
        ariaLabel="Format"
        role="radiogroup"
      />
    );
    expect(screen.getByRole('radiogroup', { name: 'Format' })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    const settings = screen.getByRole('radio', { name: 'Settings' });
    expect(settings).toHaveAttribute('aria-checked', 'true');
    expect(settings).not.toHaveAttribute('aria-selected');
    settings.focus();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('style');
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: 'Style' })
    );
  });
});
