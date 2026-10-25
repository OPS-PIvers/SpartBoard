import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const blockState = vi.hoisted(() => ({ enabled: false, loaded: true }));
vi.mock('@/hooks/useStudentContextMenuBlock', () => ({
  useStudentContextMenuBlock: () => blockState,
}));

import {
  NO_CALLOUT_CLASS,
  StudentContextMenuGuard,
} from '@/components/student/StudentContextMenuGuard';

const rightClick = (target: Element): boolean =>
  target.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  );

describe('StudentContextMenuGuard', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/quiz/abc');
  });
  afterEach(() => {
    blockState.enabled = false;
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('leaves the menu alone while the switch is off', () => {
    render(<StudentContextMenuGuard />);
    const box = document.createElement('textarea');
    document.body.appendChild(box);
    expect(rightClick(box)).toBe(true);
    expect(document.documentElement).not.toHaveClass(NO_CALLOUT_CLASS);
  });

  it('blocks the menu, including in text boxes, and opts fields out of Grammarly', async () => {
    blockState.enabled = true;
    const before = document.createElement('input');
    document.body.appendChild(before);
    const { unmount } = render(<StudentContextMenuGuard />);

    const later = document.createElement('div');
    later.innerHTML = '<textarea></textarea><div contenteditable="true"></div>';
    await act(async () => {
      document.body.appendChild(later);
      await Promise.resolve();
    });

    const textarea = later.querySelector('textarea');
    const editable = later.querySelector('[contenteditable]');
    if (!textarea || !editable) throw new Error('fixture missing');
    expect(rightClick(before)).toBe(false);
    expect(rightClick(textarea)).toBe(false);
    expect(document.documentElement).toHaveClass(NO_CALLOUT_CLASS);
    for (const el of [document.body, before, textarea, editable]) {
      expect(el).toHaveAttribute('data-gramm', 'false');
      expect(el).toHaveAttribute('data-enable-grammarly', 'false');
    }

    unmount();
    expect(rightClick(before)).toBe(true);
    expect(document.documentElement).not.toHaveClass(NO_CALLOUT_CLASS);
  });

  it('never blocks on teacher pages', () => {
    blockState.enabled = true;
    window.history.replaceState(null, '', '/');
    render(<StudentContextMenuGuard />);
    expect(rightClick(document.body)).toBe(true);
  });
});
