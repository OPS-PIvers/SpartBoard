import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StimulusQuotePopover } from '@/components/quiz/StimulusQuotePopover';

const rect = { top: 100, bottom: 120, left: 50, width: 80, height: 20 };

const flush = () =>
  act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

const selectPassage = async () => {
  const text = document.querySelector('#passage')?.firstChild;
  if (!text) throw new Error('passage missing');
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 13);
  const selection = document.getSelection();
  if (!selection) throw new Error('no selection');
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  await flush();
};

describe('StimulusQuotePopover', () => {
  beforeEach(() => {
    Range.prototype.getBoundingClientRect = () => rect as DOMRect;
    document.body.innerHTML =
      '<div data-stimulus-quotable="true" data-stimulus-id="s1"><p id="passage">The effect was not large.</p></div>';
  });
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
  });

  it('quotes the selection even when a tap clears it before the click', async () => {
    const onQuote = vi.fn();
    render(<StimulusQuotePopover onQuote={onQuote} />);
    await selectPassage();
    const button = screen.getByTestId('stimulus-quote-button');

    fireEvent.pointerDown(button);
    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.pointerUp(button);
    await flush();
    fireEvent.click(screen.getByTestId('stimulus-quote-button'));

    expect(onQuote).toHaveBeenCalledWith({
      stimulusId: 's1',
      text: 'effect wa',
    });
  });

  it('hides when the selection clears without a press', async () => {
    render(<StimulusQuotePopover onQuote={vi.fn()} />);
    await selectPassage();
    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    await flush();
    expect(screen.queryByTestId('stimulus-quote-button')).toBeNull();
  });
});
