import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { WidgetData } from '@/types';

// Stub the sticker chain so the test does not need DraggableSticker's full
// rendering surface (which pulls in lucide icons, drag handlers, etc.). The
// thing under test is the wrapper's pointer-events behavior, not the
// sticker content.
vi.mock('@/components/widgets/stickers/StickerItemWidget', () => ({
  StickerItemWidget: ({ widget }: { widget: WidgetData }) => (
    <div data-testid="stub-sticker-content">{widget.id}</div>
  ),
}));

import { ReadOnlySticker } from '@/components/subs/SubBoardCanvas';

function makeSticker(): WidgetData {
  return {
    id: 'stk-1',
    type: 'sticker',
    x: 100,
    y: 100,
    w: 80,
    h: 80,
    z: 1,
    config: { color: 'amber', icon: 'Star' },
  } as unknown as WidgetData;
}

describe('ReadOnlySticker (sub portal sticker lock)', () => {
  it('renders the sticker content', () => {
    render(<ReadOnlySticker widget={makeSticker()} />);
    expect(screen.getByTestId('stub-sticker-content')).toBeTruthy();
  });

  it('applies pointer-events: none on the wrapper to block drag/resize', () => {
    // The wrapper is what disables interactions — DraggableSticker itself
    // does not honour `isActiveBoardReadOnly`, so the lock has to come
    // from this wrapper. If a future change drops the inline style or
    // moves it onto the child, subs would regain drag/resize on stickers.
    render(<ReadOnlySticker widget={makeSticker()} />);
    const wrapper = screen.getByTestId('readonly-sticker-wrapper');
    expect(wrapper.style.pointerEvents).toBe('none');
  });

  it('does NOT apply absolute positioning (avoids double-offset bug)', () => {
    // DraggableSticker owns position:absolute + left/top/width/height. If
    // the wrapper ALSO applied position:absolute, the sticker would render
    // offset by 2× its (x, y) coordinates. Pin the absence of any position
    // override here so the bug Copilot caught earlier cannot regress.
    render(<ReadOnlySticker widget={makeSticker()} />);
    const wrapper = screen.getByTestId('readonly-sticker-wrapper');
    expect(wrapper.style.position).toBe('');
    expect(wrapper.style.left).toBe('');
    expect(wrapper.style.top).toBe('');
  });
});
