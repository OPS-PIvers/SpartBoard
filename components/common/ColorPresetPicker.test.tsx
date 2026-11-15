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

  it('commits a typed hex equal to the fallback when the value is cleared', () => {
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Text"
        presets={[]}
        value={undefined}
        fallback="#000000"
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText('Text hex value');
    fireEvent.change(input, { target: { value: '#000' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('#000000');
  });

  it('does not set a color when a cleared input is only focused and blurred', () => {
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Text"
        presets={[]}
        value={undefined}
        fallback="#000000"
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText('Text hex value');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not commit the fallback when the value is cleared from outside mid-typing', () => {
    const onChange = vi.fn();
    const props = {
      label: 'Text',
      presets: [],
      fallback: '#000000',
      onChange,
    };
    const { rerender } = render(
      <ColorPresetPicker {...props} value="#ff0000" />
    );
    const input = screen.getByLabelText('Text hex value');
    fireEvent.change(input, { target: { value: '#12' } });
    rerender(<ColorPresetPicker {...props} value={undefined} />);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits a typed fallback hex when the stored value is not a 3/6-digit hex', () => {
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Text"
        presets={[]}
        value="#ff000080"
        fallback="#000000"
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText('Text hex value');
    fireEvent.change(input, { target: { value: '#000' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('#000000');
  });
});
