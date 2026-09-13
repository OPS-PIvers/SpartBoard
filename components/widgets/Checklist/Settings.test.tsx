import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChecklistSettings } from './SchemaControls';
import { useDashboard } from '@/context/useDashboard';
import { ChecklistItem, WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const widget: WidgetData = {
  id: 'checklist-test-1',
  type: 'checklist',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: true,
  config: {
    items: [],
    mode: 'roster',
    rosterMode: 'custom',
    firstNames: '',
    lastNames: '',
  },
};

describe('ChecklistSettings — First/Last Names label associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
      activeDashboard: undefined,
      addToast: vi.fn(),
      rosters: [],
      activeRosterId: undefined,
    });
  });

  it('names the First Names textarea from its label', () => {
    render(<ChecklistSettings widget={widget} />);

    expect(screen.getByLabelText('First Names')).toBeInstanceOf(
      HTMLTextAreaElement
    );
  });

  it('names the Last Names textarea from its label', () => {
    render(<ChecklistSettings widget={widget} />);

    expect(screen.getByLabelText('Last Names')).toBeInstanceOf(
      HTMLTextAreaElement
    );
  });
});

describe('ChecklistSettings — task list draft survives save echoes', () => {
  it('keeps keystrokes typed after the debounced save when the items echo back', () => {
    vi.useFakeTimers();
    const updateWidget = vi.fn();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      activeDashboard: undefined,
      addToast: vi.fn(),
      rosters: [],
      activeRosterId: undefined,
    });
    const manual: WidgetData = {
      ...widget,
      config: { ...widget.config, mode: 'manual', items: [] },
    };
    const { rerender } = render(<ChecklistSettings widget={manual} />);
    const box = screen.getByPlaceholderText<HTMLTextAreaElement>(
      'Enter tasks here...'
    );

    fireEvent.change(box, { target: { value: 'r' } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(updateWidget).toHaveBeenCalledTimes(1);
    const saved = (
      updateWidget.mock.calls[0][1] as { config: { items: ChecklistItem[] } }
    ).config.items;
    expect(saved.map((i) => i.text)).toEqual(['r']);

    // Typing continues before the save round-trips.
    fireEvent.change(box, { target: { value: 're' } });

    // Local optimistic update, then the Firestore echo with fresh object refs.
    rerender(
      <ChecklistSettings
        widget={{ ...manual, config: { ...manual.config, items: saved } }}
      />
    );
    rerender(
      <ChecklistSettings
        widget={{
          ...manual,
          config: { ...manual.config, items: saved.map((i) => ({ ...i })) },
        }}
      />
    );
    expect(box.value).toBe('re');

    // A genuine external edit still replaces the draft.
    rerender(
      <ChecklistSettings
        widget={{
          ...manual,
          config: {
            ...manual.config,
            items: [{ id: 'x', text: 'from elsewhere', completed: false }],
          },
        }}
      />
    );
    expect(box.value).toBe('from elsewhere');
    vi.useRealTimers();
  });
});
