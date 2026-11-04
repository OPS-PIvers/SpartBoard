import { describe, expect, it } from 'vitest';
import { asChoiceStep, nativeSelectOf, selectChoices } from './nativeSelect';

const mount = () => {
  document.body.innerHTML =
    '<select data-tour="connections.editor.advance" data-tour-widget-type="random"><option value="now">Right  away</option><option value="pause">After a few seconds</option></select><button data-tour="dock.open-tools">Tools</button>';
  document.querySelectorAll('select, button').forEach((el) => {
    el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20);
  });
};

describe('native dropdown steps', () => {
  it('finds the dropdown a step points at and reads its options', () => {
    mount();
    const el = nativeSelectOf({
      anchor: 'connections.editor.advance:random',
      action: 'select',
    });
    expect(el).toBeInstanceOf(HTMLSelectElement);
    expect(selectChoices(el as HTMLSelectElement)).toEqual([
      { value: 'now', label: 'Right away' },
      { value: 'pause', label: 'After a few seconds' },
    ]);
    expect(
      nativeSelectOf({ anchor: 'dock.open-tools', action: 'click' })
    ).toBeNull();
  });

  it('turns a click on a dropdown into a choice and leaves other steps alone', () => {
    mount();
    expect(
      asChoiceStep({ anchor: 'connections.editor.advance', action: 'click' })
    ).toEqual({ anchor: 'connections.editor.advance', action: 'select' });
    const button = { anchor: 'dock.open-tools', action: 'click' } as const;
    expect(asChoiceStep(button)).toBe(button);
    const typed = {
      anchor: 'connections.editor.advance',
      action: 'observe',
    } as const;
    expect(asChoiceStep(typed)).toBe(typed);
  });
});
