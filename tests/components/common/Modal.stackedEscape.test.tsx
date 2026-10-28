import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Modal } from '@/components/common/Modal';

describe('Modal stacked Escape', () => {
  afterEach(cleanup);

  it('closes only the topmost modal on one Escape', () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <>
        <Modal isOpen onClose={closeOuter} title="Outer">
          <div>outer</div>
        </Modal>
        <Modal isOpen onClose={closeInner} title="Inner">
          <div>inner</div>
        </Modal>
      </>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('hands Escape to the lower modal once the top one unmounts', () => {
    const closeOuter = vi.fn();
    const ui = (innerOpen: boolean) => (
      <>
        <Modal isOpen onClose={closeOuter} title="Outer">
          <div>outer</div>
        </Modal>
        <Modal isOpen={innerOpen} onClose={vi.fn()} title="Inner">
          <div>inner</div>
        </Modal>
      </>
    );
    const { rerender } = render(ui(true));
    rerender(ui(false));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeOuter).toHaveBeenCalledTimes(1);
  });
});
