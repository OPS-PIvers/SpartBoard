import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { installSelectMenus, isSelectMenuOpen } from './selectMenu';
import { installDatePickers, isDatePickerOpen } from './datePicker';
import { installSuggestionLists, isSuggestionListOpen } from './suggestionList';
import { appPickersEnabled } from './pickerPanel';
import { switchAppPickers } from './appPickers';

// With the app-pickers flag off the browser's own pickers must show: no preventDefault, no panel.
let uninstall: Array<() => void>;
beforeEach(() => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
  );
  switchAppPickers(false);
  uninstall = [
    installSelectMenus(),
    installDatePickers(),
    installSuggestionLists(),
  ];
});
afterEach(() => {
  uninstall.forEach((u) => u());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('app pickers switched off', () => {
  it('is off by default', () => {
    expect(appPickersEnabled()).toBe(false);
  });

  it('leaves the native select list alone', () => {
    document.body.innerHTML =
      '<select aria-label="Fruit"><option>A</option><option>B</option></select>';
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(fireEvent.mouseDown(select)).toBe(true);
    expect(fireEvent.keyDown(select, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(select, { key: 'Enter' })).toBe(true);
    expect(isSelectMenuOpen()).toBe(false);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('leaves the native date picker alone', () => {
    document.body.innerHTML = '<input type="date" aria-label="Due" />';
    const input = document.querySelector('input') as HTMLInputElement;
    expect(fireEvent.click(input)).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })).toBe(
      true
    );
    expect(isDatePickerOpen()).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('leaves the native suggestion list alone', () => {
    document.body.innerHTML =
      '<input aria-label="Category" list="cats" /><datalist id="cats"><option value="Math"></option></datalist>';
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.focusIn(input);
    expect(input.getAttribute('list')).toBe('cats');
    expect(fireEvent.click(input)).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(true);
    expect(isSuggestionListOpen()).toBe(false);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('closes an open panel when switched off', () => {
    switchAppPickers(true);
    document.body.innerHTML =
      '<select aria-label="Fruit"><option>A</option><option>B</option></select>';
    const select = document.querySelector('select') as HTMLSelectElement;
    fireEvent.mouseDown(select);
    expect(isSelectMenuOpen()).toBe(true);
    switchAppPickers(false);
    expect(isSelectMenuOpen()).toBe(false);
  });
});
