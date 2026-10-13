import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CheckSubmitPanel } from '@/components/flashcards/PlayerPrimitives';
import { installTranslateDomGuard } from '@/utils/translateDomGuard';

const panel = (submitting: boolean) => (
  <CheckSubmitPanel
    mode="write"
    dark={false}
    submitting={submitting}
    flaggedCount={0}
    onSubmit={vi.fn()}
  />
);

// Mimics Chrome Translate: each text node is replaced by <font><font>translated</font></font>.
const translate = (root: Element) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    const outer = document.createElement('font');
    const inner = document.createElement('font');
    inner.textContent = `[es] ${text.data}`;
    outer.appendChild(inner);
    text.parentNode?.replaceChild(outer, text);
  }
};

describe('installTranslateDomGuard', () => {
  it('stops a translated page from crashing when Submit is clicked', () => {
    const { rerender, container } = render(panel(false));
    translate(container);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => rerender(panel(true))).toThrow();
    vi.mocked(console.error).mockRestore();

    installTranslateDomGuard();
    const second = render(panel(false));
    translate(second.container);
    expect(() => second.rerender(panel(true))).not.toThrow();
    const button = screen.getAllByRole('button').at(-1);
    expect(button?.querySelector('svg.animate-spin')).not.toBeNull();
    second.rerender(panel(false));
    expect(button?.querySelector('svg.animate-spin')).toBeNull();
    second.unmount();
  });

  it('still removes and inserts nodes normally', () => {
    installTranslateDomGuard();
    const parent = document.createElement('div');
    const a = document.createElement('span');
    const b = document.createElement('span');
    parent.appendChild(b);
    parent.insertBefore(a, b);
    expect(Array.from(parent.childNodes)).toEqual([a, b]);
    parent.removeChild(a);
    expect(Array.from(parent.childNodes)).toEqual([b]);
    expect(parent.removeChild(a)).toBe(a);
  });
  it('survives a label that swaps to a spinner, like the quiz SUBMIT button', () => {
    installTranslateDomGuard();
    const QuizSubmit = ({ submitting }: { submitting: boolean }) => (
      <button type="button">
        {submitting ? (
          <svg className="spin" />
        ) : (
          <>
            {'SUBMIT'} <svg className="check" />
          </>
        )}
      </button>
    );
    const { rerender, container } = render(<QuizSubmit submitting={false} />);
    translate(container);
    expect(() => rerender(<QuizSubmit submitting />)).not.toThrow();
    expect(container.querySelector('svg.spin')).not.toBeNull();
  });
});
