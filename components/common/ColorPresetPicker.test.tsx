import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ColorPresetPicker } from './ColorPresetPicker';

describe('ColorPresetPicker hex input', () => {
  it('does not commit on the Enter that confirms an IME composition', () => {
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Text"
        presets={[]}
        value="#000000"
        fallback="#000000"
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText('Text hex value');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('abc');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('#aabbcc');
  });
});
