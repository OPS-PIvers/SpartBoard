import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OptionInput } from './PollWidget/components/OptionInput';
import { AgendaRow } from './ArtsLettersAgenda/components/AgendaRow';

describe('IME composition Enter does not commit', () => {
  it('OptionInput keeps focus while Enter confirms a composition', () => {
    const onSave = vi.fn();
    render(<OptionInput label="" index={0} onSave={onSave} />);
    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('AgendaRow keeps focus while Enter confirms a composition', () => {
    const onCommit = vi.fn();
    render(
      <AgendaRow
        id="do-now"
        label="Do Now"
        description=""
        isDone={false}
        onToggle={vi.fn()}
        onDescriptionCommit={onCommit}
        titleSize="12px"
        descSize="12px"
        boxSize="12px"
        cardColor="#fff"
        cardOpacity={1}
        fontColor="#000"
      />
    );
    const area = screen.getByLabelText('Do Now details');
    area.focus();
    fireEvent.change(area, { target: { value: 'x' } });
    fireEvent.keyDown(area, { key: 'Enter', isComposing: true });
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(area, { key: 'Enter', keyCode: 229 });
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
