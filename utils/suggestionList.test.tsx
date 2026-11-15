import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { installSuggestionLists, isSuggestionListOpen } from './suggestionList';

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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  });
  uninstall = installSuggestionLists();
});
afterEach(() => {
  uninstall();
  vi.restoreAllMocks();
});

const Category: React.FC<{ onPick?: (v: string) => void }> = ({ onPick }) => {
  const [value, setValue] = useState('');
  return (
    <>
      <input
        aria-label="Category"
        value={value}
        list="cats"
        onChange={(e) => {
          setValue(e.target.value);
          onPick?.(e.target.value);
        }}
      />
      <datalist id="cats">
        <option value="Nature" />
        <option value="Seasons" />
        <option value="Space" />
      </datalist>
    </>
  );
};

const field = (): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>(
    'input[aria-label="Category"]'
  );
  if (!el) throw new Error('field missing');
  return el;
};
const list = () => screen.getByRole('listbox', { name: 'Category' });

describe('suggestionList', () => {
  it('hides the browser list while the field has focus and gives it back after', () => {
    render(<Category />);
    act(() => field().focus());
    expect(field()).not.toHaveAttribute('list');
    act(() => field().blur());
    expect(field()).toHaveAttribute('list', 'cats');
  });

  it('shows matching suggestions as you type and fills the field on a click', () => {
    const onPick = vi.fn();
    render(<Category onPick={onPick} />);
    act(() => field().focus());
    fireEvent.change(field(), { target: { value: 'sp' } });
    fireEvent.input(field());
    expect(
      within(list())
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Space']);
    fireEvent.click(within(list()).getByRole('option', { name: 'Space' }));
    expect(onPick).toHaveBeenLastCalledWith('Space');
    expect(field().value).toBe('Space');
    expect(isSuggestionListOpen()).toBe(false);
  });

  it('picks with the arrow keys and Enter, and Escape closes', () => {
    const onPick = vi.fn();
    const onEnter = vi.fn<() => void>();
    render(
      <div onKeyDown={(e) => e.key === 'Enter' && onEnter()}>
        <Category onPick={onPick} />
      </div>
    );
    act(() => field().focus());
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(isSuggestionListOpen()).toBe(true);
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith('Seasons');
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(isSuggestionListOpen()).toBe(false);
  });

  it('lets Enter reach the field when no suggestion is highlighted', () => {
    const onEnter = vi.fn<() => void>();
    render(
      <div onKeyDown={(e) => e.key === 'Enter' && onEnter()}>
        <Category />
      </div>
    );
    act(() => field().focus());
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalled();
  });
});
