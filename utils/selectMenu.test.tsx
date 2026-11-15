import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { installSelectMenus, isSelectMenuOpen } from './selectMenu';
import { setAppPickersEnabled } from './pickerPanel';

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
  setAppPickersEnabled(true);
  uninstall = installSelectMenus();
});
afterEach(() => {
  uninstall();
  setAppPickersEnabled(false);
  vi.restoreAllMocks();
});

const Controlled: React.FC<{ onPick?: (v: string) => void }> = ({ onPick }) => {
  const [value, setValue] = useState('b');
  return (
    <label>
      Fruit
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onPick?.(e.target.value);
        }}
      >
        <option value="a">Apple</option>
        <option value="b">Banana</option>
        <option value="c" disabled>
          Cherry
        </option>
        <option value="d" hidden>
          Date
        </option>
        <optgroup label="More">
          <option value="e">Elderberry</option>
        </optgroup>
      </select>
    </label>
  );
};

const listbox = () => screen.getByRole('listbox');
const menuOptions = () => within(listbox()).getAllByRole('option');

describe('selectMenu', () => {
  it('opens the app list on press with the current choice marked', () => {
    render(<Controlled />);
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    expect(isSelectMenuOpen()).toBe(true);
    expect(menuOptions().map((o) => o.textContent)).toEqual([
      'Apple',
      'Banana',
      'Cherry',
      'Elderberry',
    ]);
    expect(
      within(listbox()).getByRole('option', { name: 'Banana' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      within(listbox()).getByRole('option', { name: 'Cherry' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(within(listbox()).getByRole('group', { name: 'More' })).toBeTruthy();
    expect(select).toHaveAttribute('aria-expanded', 'true');
    expect(listbox()).toHaveAttribute('aria-label', 'Fruit');
  });

  it('fires the select onChange when an option is clicked, then closes', () => {
    const onPick = vi.fn();
    render(<Controlled onPick={onPick} />);
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    fireEvent.mouseDown(select);
    fireEvent.click(
      within(listbox()).getByRole('option', { name: 'Elderberry' })
    );
    expect(onPick).toHaveBeenCalledWith('e');
    expect(select.value).toBe('e');
    expect(isSelectMenuOpen()).toBe(false);
    expect(select).not.toHaveAttribute('aria-expanded');
  });

  it('ignores disabled options and does not refire for the current choice', () => {
    const onPick = vi.fn();
    render(<Controlled onPick={onPick} />);
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(within(listbox()).getByRole('option', { name: 'Cherry' }));
    expect(isSelectMenuOpen()).toBe(true);
    fireEvent.click(within(listbox()).getByRole('option', { name: 'Banana' }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('works from the keyboard and skips disabled options', () => {
    const onPick = vi.fn();
    render(<Controlled onPick={onPick} />);
    const select = screen.getByRole('combobox');
    select.focus();
    fireEvent.keyDown(select, { key: ' ' });
    expect(isSelectMenuOpen()).toBe(true);
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('e');
  });

  it('closes on Escape without changing the value or reaching other handlers', () => {
    const onPick = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Controlled onPick={onPick} />
      </div>
    );
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(isSelectMenuOpen()).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  });

  it('jumps to an option by typing its first letters', () => {
    const onPick = vi.fn();
    render(<Controlled onPick={onPick} />);
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    fireEvent.keyDown(select, { key: 'a' });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('a');
  });

  it('closes when pressing elsewhere or when the select loses focus', () => {
    render(
      <>
        <Controlled />
        <button type="button">Elsewhere</button>
      </>
    );
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(isSelectMenuOpen()).toBe(false);
    fireEvent.mouseDown(select);
    act(() => select.blur());
    expect(isSelectMenuOpen()).toBe(false);
  });

  it('leaves multi-selects and disabled selects to the browser', () => {
    render(
      <>
        <select multiple aria-label="Many" defaultValue={[]}>
          <option>One</option>
        </select>
        <select disabled aria-label="Off">
          <option>One</option>
        </select>
      </>
    );
    fireEvent.mouseDown(screen.getByRole('listbox', { name: 'Many' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Off' }));
    expect(isSelectMenuOpen()).toBe(false);
  });

  it('keeps presses on the list away from click-outside closers and window Escape handlers', () => {
    const outside = vi.fn();
    const escape = vi.fn();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('mousedown', outside);
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escape();
    };
    window.addEventListener('keydown', onWindowKey, true);
    render(<Controlled />);
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    const option = within(listbox()).getByRole('option', { name: 'Apple' });
    fireEvent.pointerDown(option);
    fireEvent.mouseDown(option);
    expect(outside).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(escape).not.toHaveBeenCalled();
    expect(isSelectMenuOpen()).toBe(false);
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('mousedown', outside);
    window.removeEventListener('keydown', onWindowKey, true);
  });

  it('leaves a select disabled by its fieldset closed', () => {
    render(
      <fieldset disabled>
        <select aria-label="Locked" defaultValue="a">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      </fieldset>
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Locked' }));
    expect(isSelectMenuOpen()).toBe(false);
  });

  it('lets Space finish a typed search on a closed select', () => {
    render(<Controlled />);
    const select = screen.getByRole('combobox');
    select.focus();
    fireEvent.keyDown(select, { key: 'n' });
    fireEvent.keyDown(select, { key: ' ' });
    expect(isSelectMenuOpen()).toBe(false);
  });

  it('rebuilds the list when the options change while it is open', async () => {
    const Swap: React.FC = () => {
      const [more, setMore] = useState(false);
      return (
        <>
          <select
            aria-label="Swap"
            defaultValue="a"
            onFocus={() => setMore(true)}
          >
            <option value="a">A</option>
            {more && <option value="z">Zed</option>}
          </select>
        </>
      );
    };
    render(<Swap />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Swap' }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(menuOptions().map((o) => o.textContent)).toEqual(['A', 'Zed']);
  });
});
