import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const blockState = vi.hoisted(() => ({ enabled: false, loaded: true }));
const grammarlyState = vi.hoisted(() => ({ enabled: false, loaded: true }));
vi.mock('@/hooks/useStudentContextMenuBlock', () => ({
  useStudentContextMenuBlock: () => blockState,
  useStudentGrammarlyBlock: () => grammarlyState,
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
    grammarlyState.enabled = false;
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

  it('blocks the menu, including in text boxes, without touching Grammarly', () => {
    blockState.enabled = true;
    const box = document.createElement('input');
    document.body.appendChild(box);
    const { unmount } = render(<StudentContextMenuGuard />);

    expect(rightClick(box)).toBe(false);
    expect(document.documentElement).toHaveClass(NO_CALLOUT_CLASS);
    expect(box).not.toHaveAttribute('data-gramm');

    unmount();
    expect(rightClick(box)).toBe(true);
    expect(document.documentElement).not.toHaveClass(NO_CALLOUT_CLASS);
  });

  it('opts every field out of Grammarly on its own switch, then clears it', async () => {
    grammarlyState.enabled = true;
    const before = document.createElement('input');
    const plain = document.createElement('div');
    document.body.append(before, plain);
    const { unmount } = render(<StudentContextMenuGuard />);

    const later = document.createElement('div');
    later.innerHTML = '<textarea></textarea><div contenteditable="true"></div>';
    await act(async () => {
      document.body.appendChild(later);
      plain.setAttribute('contenteditable', 'true');
      await Promise.resolve();
    });

    const textarea = later.querySelector('textarea');
    const editable = later.querySelector('[contenteditable]');
    if (!textarea || !editable) throw new Error('fixture missing');
    expect(rightClick(before)).toBe(true);
    for (const el of [document.body, before, plain, textarea, editable]) {
      expect(el).toHaveAttribute('data-gramm', 'false');
      expect(el).toHaveAttribute('data-gramm_editor', 'false');
      expect(el).toHaveAttribute('data-enable-grammarly', 'false');
      expect(el).toHaveAttribute('data-lt-active', 'false');
    }

    unmount();
    for (const el of [document.body, before, plain, textarea, editable]) {
      expect(el).not.toHaveAttribute('data-gramm');
    }
  });

  it('never blocks on teacher pages', () => {
    blockState.enabled = true;
    grammarlyState.enabled = true;
    window.history.replaceState(null, '', '/');
    render(<StudentContextMenuGuard />);
    expect(rightClick(document.body)).toBe(true);
    expect(document.body).not.toHaveAttribute('data-gramm');
  });
});
