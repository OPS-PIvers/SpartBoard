import React, { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningPublicStep } from '@/types';
import { plainStepText } from '../../utils/stepText';

interface Props {
  steps: GuidedLearningPublicStep[];
  currentIdx: number;
  doneIds: ReadonlySet<string>;
  /** Group headings by slide when the set has more than one. */
  showSlides: boolean;
  canJump: (index: number) => boolean;
  onJump: (index: number) => void;
}

/** The "N / M" footer button and the step list it opens. */
export const StepOutline: React.FC<Props> = ({
  steps,
  currentIdx,
  doneIds,
  showSlides,
  canJump,
  onJump,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  // Outside clicks close the list; focus moves to the current step on open.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.focus({ preventScroll: false });
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('glPlayer.outline.open', {
          current: currentIdx + 1,
          total: steps.length,
        })}
        onClick={() => setOpen((v) => !v)}
        className="text-slate-200 font-bold tabular-nums rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
        style={{
          fontSize: 'min(12px, 3.2cqmin)',
          padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
        }}
      >
        {currentIdx + 1} / {steps.length}
      </button>
      {open && (
        <div
          ref={listRef}
          role="dialog"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            }
          }}
          className="absolute bottom-full right-0 z-50 overflow-y-auto rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur-md shadow-2xl"
          style={{
            marginBottom: 'min(8px, 2cqmin)',
            width: 'min(300px, 80cqw)',
            maxHeight: 'min(360px, 60cqh)',
            padding: 'min(6px, 1.5cqmin)',
          }}
        >
          <div
            id={titleId}
            className="text-slate-300 font-bold uppercase tracking-wide"
            style={{
              fontSize: 'min(11px, 3cqmin)',
              padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
            }}
          >
            {t('glPlayer.outline.title')}
          </div>
          <ol className="list-none m-0 p-0">
            {steps.map((s, i) => {
              const slide = s.imageIndex ?? 0;
              const heading =
                showSlides &&
                (i === 0 || (steps[i - 1].imageIndex ?? 0) !== slide) ? (
                  <li
                    key={`slide-${i}`}
                    aria-hidden="true"
                    className="text-slate-300 font-semibold"
                    style={{
                      fontSize: 'min(11px, 3cqmin)',
                      padding: 'min(8px, 2cqmin) min(8px, 2cqmin) 0',
                    }}
                  >
                    {t('glPlayer.outline.slide', { n: slide + 1 })}
                  </li>
                ) : null;
              const current = i === currentIdx;
              const done = doneIds.has(s.id);
              const label =
                plainStepText(s.label) ||
                t('glPlayer.outline.step', { n: i + 1 });
              return (
                <React.Fragment key={s.id}>
                  {heading}
                  <li>
                    <button
                      type="button"
                      aria-current={current ? 'step' : undefined}
                      disabled={!canJump(i)}
                      onClick={() => {
                        onJump(i);
                        close(false);
                      }}
                      className={`w-full flex items-center text-left rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
                        current
                          ? 'bg-indigo-500/25 text-white'
                          : 'text-slate-200 hover:bg-white/10'
                      }`}
                      style={{
                        gap: 'min(8px, 2cqmin)',
                        padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
                        fontSize: 'min(13px, 3.4cqmin)',
                      }}
                    >
                      <span className="tabular-nums text-slate-300 flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate">{label}</span>
                      {current && (
                        <span className="sr-only">
                          {t('glPlayer.outline.current')}
                        </span>
                      )}
                      {done && (
                        <Check
                          aria-label={t('glPlayer.outline.done')}
                          className="text-emerald-300 flex-shrink-0"
                          style={{
                            width: 'min(14px, 3.5cqmin)',
                            height: 'min(14px, 3.5cqmin)',
                          }}
                        />
                      )}
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
};
