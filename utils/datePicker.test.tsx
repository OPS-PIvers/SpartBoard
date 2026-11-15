import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  installDatePickers,
  isDatePickerOpen,
  openFieldPicker,
} from './datePicker';

const RECT = {
  x: 10,
  y: 10,
  left: 10,
  top: 10,
  right: 210,
  bottom: 40,
  width: 200,
  height: 30,
};

let uninstall: () => void;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15, 9, 41));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  });
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
  );
  uninstall = installDatePickers();
});
afterEach(() => {
  uninstall();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const Field: React.FC<{
  type: 'date' | 'time' | 'datetime-local';
  initial?: string;
  min?: string;
  onPick?: (v: string) => void;
}> = ({ type, initial = '', min, onPick }) => {
  const [value, setValue] = useState(initial);
  return (
    <input
      aria-label="When"
      type={type}
      min={min}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onPick?.(e.target.value);
      }}
    />
  );
};

const field = (): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>(
    'input[aria-label="When"]'
  );
  if (!el) throw new Error('field missing');
  return el;
};
const iconClick = (el: HTMLElement) => fireEvent.click(el, { clientX: 205 });
const panel = () => screen.getByRole('dialog', { name: 'When' });
const day = (name: RegExp) => within(panel()).getByRole('gridcell', { name });

describe('datePicker', () => {
  it('opens the app calendar from the field icon on the value month', () => {
    render(<Field type="date" initial="2026-03-04" />);
    const clicked = iconClick(field());
    expect(clicked).toBe(false);
    expect(isDatePickerOpen()).toBe(true);
    expect(day(/March 4, 2026/)).toHaveAttribute('aria-selected', 'true');
    expect(field()).toHaveAttribute('aria-expanded', 'true');
  });

  it('only stops the browser calendar for a click away from the icon', () => {
    render(<Field type="date" />);
    expect(fireEvent.click(field(), { clientX: 20 })).toBe(false);
    expect(isDatePickerOpen()).toBe(false);
  });

  it('fires onChange with the picked day and closes', () => {
    const onPick = vi.fn();
    render(<Field type="date" initial="2026-11-02" onPick={onPick} />);
    iconClick(field());
    fireEvent.click(day(/November 20, 2026/));
    expect(onPick).toHaveBeenCalledWith('2026-11-20');
    expect(field().value).toBe('2026-11-20');
    expect(isDatePickerOpen()).toBe(false);
  });

  it('pages months and keeps days before min out of reach', () => {
    const onPick = vi.fn();
    render(<Field type="date" min="2026-11-10" onPick={onPick} />);
    iconClick(field());
    expect(day(/November 9, 2026/)).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(day(/November 9, 2026/));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Next month' })
    );
    fireEvent.click(day(/December 1, 2026/));
    expect(onPick).toHaveBeenCalledWith('2026-12-01');
  });

  it('works from the keyboard', () => {
    const onPick = vi.fn();
    render(<Field type="date" initial="2026-11-15" onPick={onPick} />);
    const input = field();
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true });
    expect(isDatePickerOpen()).toBe(true);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('2026-11-23');
    expect(isDatePickerOpen()).toBe(false);
  });

  it('closes on Escape before any other window handler sees it', () => {
    const escape = vi.fn<() => void>();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && escape();
    window.addEventListener('keydown', onKey, true);
    render(<Field type="date" />);
    iconClick(field());
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(isDatePickerOpen()).toBe(false);
    expect(escape).not.toHaveBeenCalled();
    window.removeEventListener('keydown', onKey, true);
  });

  it('clears and picks today from the footer', () => {
    const onPick = vi.fn();
    render(<Field type="date" initial="2026-01-01" onPick={onPick} />);
    iconClick(field());
    fireEvent.click(within(panel()).getByRole('button', { name: 'Today' }));
    expect(onPick).toHaveBeenLastCalledWith('2026-11-15');
    iconClick(field());
    fireEvent.click(within(panel()).getByRole('button', { name: 'Clear' }));
    expect(onPick).toHaveBeenLastCalledWith('');
  });

  it('sets a time from the hour, minute and AM/PM columns', () => {
    const onPick = vi.fn();
    render(<Field type="time" onPick={onPick} />);
    iconClick(field());
    const hours = within(panel()).getByRole('listbox', { name: 'Hour' });
    fireEvent.click(within(hours).getByRole('option', { name: '3' }));
    expect(onPick).toHaveBeenLastCalledWith('03:41');
    const minutes = within(panel()).getByRole('listbox', { name: 'Minute' });
    fireEvent.click(within(minutes).getByRole('option', { name: '05' }));
    expect(onPick).toHaveBeenLastCalledWith('03:05');
    const period = within(panel()).getByRole('listbox', { name: 'AM or PM' });
    fireEvent.click(within(period).getByRole('option', { name: 'PM' }));
    expect(onPick).toHaveBeenLastCalledWith('15:05');
    expect(isDatePickerOpen()).toBe(true);
  });

  it('fires change once when a date-and-time panel closes, like the browser picker', () => {
    const changes = vi.fn<() => void>();
    render(<Field type="datetime-local" initial="2026-11-15T14:30" />);
    field().addEventListener('change', changes);
    iconClick(field());
    fireEvent.click(day(/November 18, 2026/));
    fireEvent.click(day(/November 19, 2026/));
    expect(changes).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('keeps the time when a date-and-time field gets a new day', () => {
    const onPick = vi.fn();
    render(
      <Field type="datetime-local" initial="2026-11-15T14:30" onPick={onPick} />
    );
    iconClick(field());
    fireEvent.click(day(/November 18, 2026/));
    expect(onPick).toHaveBeenLastCalledWith('2026-11-18T14:30');
  });

  it('opens from a separate button next to a hidden field', () => {
    const onPick = vi.fn<(value: string) => void>();
    const Hidden: React.FC = () => {
      const ref = React.useRef<HTMLInputElement>(null);
      return (
        <>
          <button
            type="button"
            onClick={(e) => openFieldPicker(ref.current, e.currentTarget)}
          >
            Due date
          </button>
          <input
            ref={ref}
            aria-label="When"
            type="date"
            tabIndex={-1}
            defaultValue=""
            onChange={(e) => onPick(e.target.value)}
          />
        </>
      );
    };
    render(<Hidden />);
    const open = screen.getByRole('button', { name: 'Due date' });
    fireEvent.click(open);
    expect(isDatePickerOpen()).toBe(true);
    fireEvent.mouseDown(open);
    fireEvent.click(open);
    expect(isDatePickerOpen()).toBe(false);
    fireEvent.mouseDown(open);
    fireEvent.click(open);
    fireEvent.click(day(/November 16, 2026/));
    expect(onPick).toHaveBeenCalledWith('2026-11-16');
  });

  it('leaves read-only and disabled fields alone', () => {
    render(
      <>
        <input aria-label="Locked" type="date" readOnly />
        <fieldset disabled>
          <input aria-label="Off" type="date" />
        </fieldset>
      </>
    );
    iconClick(screen.getByLabelText('Locked'));
    iconClick(screen.getByLabelText('Off'));
    expect(isDatePickerOpen()).toBe(false);
  });
});
