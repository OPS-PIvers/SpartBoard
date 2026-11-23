import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SubRosterPrompt } from '@/components/subs/SubRosterPrompt';

describe('SubRosterPrompt', () => {
  it('asks the sub to load the class lists as soon as the board opens', () => {
    const onLoad = vi.fn();
    render(
      <SubRosterPrompt
        status="locked"
        teacherName="Ms. Rivera"
        onLoad={onLoad}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Load the class lists' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Tick every file/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Load class lists' });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('keeps a button on screen after the dialog is dismissed', () => {
    render(
      <SubRosterPrompt
        status="locked"
        teacherName="Ms. Rivera"
        onLoad={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(
      screen.queryByRole('heading', { name: 'Load the class lists' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load class lists' })
    ).toBeInTheDocument();
  });

  it('asks again when a pick left files out', () => {
    const { rerender } = render(
      <SubRosterPrompt
        status="locked"
        teacherName="Ms. Rivera"
        onLoad={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    rerender(
      <SubRosterPrompt
        status="partial"
        teacherName="Ms. Rivera"
        onLoad={vi.fn()}
      />
    );
    expect(
      screen.getByRole('heading', {
        name: 'Some class lists are still missing',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load the rest' })
    ).toBeInTheDocument();
  });

  it('shows nothing once every class list is loaded', () => {
    const { container } = render(
      <SubRosterPrompt
        status="ready"
        teacherName="Ms. Rivera"
        onLoad={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
