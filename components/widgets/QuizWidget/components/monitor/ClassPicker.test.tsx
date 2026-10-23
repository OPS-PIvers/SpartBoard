import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClassPicker } from './PeriodBar';

const names = ['Period 1', 'Period 3'];

describe('ClassPicker', () => {
  it('labels each class with the shared state', () => {
    const { rerender } = render(
      <ClassPicker
        names={names}
        selected=""
        onSelect={vi.fn()}
        status="active"
      />
    );
    expect(
      screen.getByRole('option', { name: 'Period 1 · Live' })
    ).toBeTruthy();
    rerender(
      <ClassPicker
        names={names}
        selected=""
        onSelect={vi.fn()}
        status="paused"
      />
    );
    expect(
      screen.getByRole('option', { name: 'Period 3 · Paused' })
    ).toBeTruthy();
    rerender(
      <ClassPicker
        names={names}
        selected=""
        onSelect={vi.fn()}
        status="waiting"
      />
    );
    expect(
      screen.getByRole('option', { name: 'Period 1 · Not started' })
    ).toBeTruthy();
  });

  it('picks a class and toggles Pause beside the picker', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn(() => Promise.resolve());
    render(
      <ClassPicker
        names={names}
        selected=""
        onSelect={onSelect}
        status="paused"
        onToggle={onToggle}
      />
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'Period 3' },
    });
    expect(onSelect).toHaveBeenCalledWith('Period 3');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('hides the toggle when the session cannot be paused here', () => {
    render(
      <ClassPicker
        names={names}
        selected=""
        onSelect={vi.fn()}
        status="active"
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
