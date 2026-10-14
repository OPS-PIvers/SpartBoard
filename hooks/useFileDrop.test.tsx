import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFileDrop } from './useFileDrop';

const Zone: React.FC<{ onFile: (file: File) => void; disabled?: boolean }> = ({
  onFile,
  disabled = false,
}) => {
  const { dragging, dropProps } = useFileDrop(onFile, disabled);
  return (
    <div data-testid="zone" {...dropProps}>
      {dragging ? 'over' : 'idle'}
    </div>
  );
};

const file = () => new File(['x'], 'test.pdf', { type: 'application/pdf' });

const drop = (files: File[]) =>
  fireEvent.drop(screen.getByTestId('zone'), {
    dataTransfer: { files, types: ['Files'] },
  });

describe('useFileDrop', () => {
  it('takes the dropped file and stops the browser opening it', () => {
    const onFile = vi.fn();
    render(<Zone onFile={onFile} />);
    // dispatchEvent returns false when the default was prevented.
    expect(drop([file()])).toBe(false);
    expect(onFile).toHaveBeenCalledOnce();
  });

  it('keeps the drop from reaching the board behind the zone', () => {
    const onFile = vi.fn();
    const onBoardDrop = vi.fn();
    render(
      <div onDrop={onBoardDrop}>
        <Zone onFile={onFile} />
      </div>
    );
    drop([file()]);
    expect(onFile).toHaveBeenCalledOnce();
    expect(onBoardDrop).not.toHaveBeenCalled();
  });

  it('still stops the browser while it is busy, and takes nothing', () => {
    const onFile = vi.fn();
    render(<Zone onFile={onFile} disabled />);
    // Letting this through navigates the tab away from the open modal.
    expect(drop([file()])).toBe(false);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('leaves a drag that carries no file to whatever else wants it', () => {
    const onFile = vi.fn();
    render(<Zone onFile={onFile} />);
    const zone = screen.getByTestId('zone');
    expect(
      fireEvent.drop(zone, {
        dataTransfer: { files: [], types: ['text/uri-list'] },
      })
    ).toBe(true);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('keeps the highlight while the pointer crosses a child', () => {
    render(<Zone onFile={vi.fn()} />);
    const zone = screen.getByTestId('zone');
    const dragging = { dataTransfer: { files: [], types: ['Files'] } };
    fireEvent.dragEnter(zone, dragging);
    fireEvent.dragEnter(zone, dragging);
    fireEvent.dragLeave(zone, dragging);
    expect(zone).toHaveTextContent('over');
    fireEvent.dragLeave(zone, dragging);
    expect(zone).toHaveTextContent('idle');
  });

  it('clears the highlight when it goes busy mid-drag and the file leaves', () => {
    const { rerender } = render(<Zone onFile={vi.fn()} />);
    const dragging = { dataTransfer: { files: [], types: ['Files'] } };
    fireEvent.dragEnter(screen.getByTestId('zone'), dragging);
    expect(screen.getByText('over')).toBeTruthy();
    rerender(<Zone onFile={vi.fn()} disabled />);
    fireEvent.dragLeave(screen.getByTestId('zone'), dragging);
    expect(screen.getByText('idle')).toBeTruthy();
  });
});
