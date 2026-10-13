import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Quote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cleanQuoteText } from '@/utils/quizQuotes';

const QUOTABLE_SELECTOR = '[data-stimulus-quotable="true"]';
const POPOVER_GAP_PX = 8;

type QuoteTarget = {
  stimulusId: string;
  text: string;
  rect: { top: number; bottom: number; left: number; width: number };
};

function readQuoteTarget(): QuoteTarget | null {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const host = (
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
  )?.closest<HTMLElement>(QUOTABLE_SELECTOR);
  const stimulusId = host?.dataset.stimulusId;
  if (!stimulusId) return null;
  const text = cleanQuoteText(sel.toString());
  if (!text) return null;
  const r = range.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    stimulusId,
    text,
    rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
  };
}

/** Floating "Add to response" button over text a student selects in a passage or PDF. */
export const StimulusQuotePopover: React.FC<{
  onQuote: (quote: { stimulusId: string; text: string }) => void;
}> = ({ onQuote }) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState<QuoteTarget | null>(null);
  // Touch browsers may clear the selection mid-tap; hold the button until the press ends.
  const pressingRef = useRef(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (pressingRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTarget(readQuoteTarget()));
    };
    document.addEventListener('selectionchange', update);
    document.addEventListener('pointerup', update);
    document.addEventListener('keyup', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('pointerup', update);
      document.removeEventListener('keyup', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!target) return null;

  // Touch browsers draw their own copy menu above a selection, so go below there.
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const top = coarse
    ? Math.min(target.rect.bottom + POPOVER_GAP_PX, window.innerHeight - 52)
    : Math.max(target.rect.top - 44 - POPOVER_GAP_PX, 8);
  const left = Math.min(
    Math.max(target.rect.left + target.rect.width / 2, 90),
    window.innerWidth - 90
  );

  return createPortal(
    <button
      type="button"
      data-testid="stimulus-quote-button"
      style={{ top, left }}
      className="fixed z-[1000] -translate-x-1/2 inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-brand-blue-primary text-white text-sm font-bold shadow-lg ring-1 ring-black/10 hover:bg-brand-blue-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [-webkit-tap-highlight-color:transparent]"
      // Keep the passage selection alive through the press.
      onPointerDown={(e) => {
        e.preventDefault();
        pressingRef.current = true;
      }}
      onPointerCancel={() => {
        pressingRef.current = false;
      }}
      onPointerLeave={() => {
        pressingRef.current = false;
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        pressingRef.current = false;
        // Clear the passage selection first; inserting the quote places the caret.
        document.getSelection()?.removeAllRanges();
        setTarget(null);
        onQuote({ stimulusId: target.stimulusId, text: target.text });
      }}
    >
      <Quote className="w-4 h-4" aria-hidden />
      {t('quizQuotes.addToResponse', 'Add to response')}
    </button>,
    document.body
  );
};
