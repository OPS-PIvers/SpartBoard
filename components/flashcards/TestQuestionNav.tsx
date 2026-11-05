import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cx } from './playerUtils';

interface TestQuestionNavProps {
  total: number;
  current: number;
  answered: readonly boolean[];
  dark: boolean;
  onJump: (index: number) => void;
}

// Sticky "Question N of M" bar with prev/next, an answered progress line and a jump grid.
export const TestQuestionNav: React.FC<TestQuestionNavProps> = ({
  total,
  current,
  answered,
  dark,
  onJump,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false));
  const answeredCount = answered.filter(Boolean).length;
  const nextUnanswered = (() => {
    for (let step = 1; step <= total; step += 1) {
      const index = (current + step) % total;
      if (!answered[index]) return index;
    }
    return -1;
  })();
  const jump = (index: number): void => {
    setOpen(false);
    onJump(index);
  };
  const iconButton = cx(
    'flex items-center justify-center rounded-md transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-35',
    dark ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'
  );
  const iconSize = {
    width: 'min(18px, 4.5cqmin)',
    height: 'min(18px, 4.5cqmin)',
  };
  const buttonBox = { width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' };

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
      className={cx(
        'sticky top-0 border-b backdrop-blur-md',
        dark
          ? 'border-white/15 bg-slate-950/85 text-white'
          : 'border-slate-200 bg-white/95 text-slate-800'
      )}
      style={{ zIndex: 2 }}
    >
      <nav
        aria-label={t('flashcards.test.nav')}
        className="mx-auto flex w-full max-w-3xl items-center"
        style={{
          gap: 'min(6px, 1.5cqmin)',
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
        }}
      >
        <button // no-tour-anchor: student test player
          type="button"
          aria-label={t('flashcards.test.previous')}
          disabled={current <= 0}
          onClick={() => jump(current - 1)}
          className={iconButton}
          style={buttonBox}
        >
          <ChevronLeft aria-hidden="true" style={iconSize} />
        </button>
        <span
          className="font-black tabular-nums"
          aria-live="polite"
          style={{ fontSize: 'min(14px, 3.6cqmin)' }}
        >
          {t('flashcards.test.questionOf', {
            number: current + 1,
            total,
          })}
        </span>
        <button // no-tour-anchor: student test player
          type="button"
          aria-label={t('flashcards.test.next')}
          disabled={current >= total - 1}
          onClick={() => jump(current + 1)}
          className={iconButton}
          style={buttonBox}
        >
          <ChevronRight aria-hidden="true" style={iconSize} />
        </button>
        <span aria-hidden="true" className="flex-1" />
        <span
          className={cx(
            'whitespace-nowrap tabular-nums @max-md:sr-only',
            dark ? 'text-white/70' : 'text-slate-500'
          )}
          style={{ fontSize: 'min(12px, 3.2cqmin)' }}
        >
          {t('flashcards.test.answeredCount', { count: answeredCount, total })}
        </span>
        <button // no-tour-anchor: student test player
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
          className={cx(
            'flex shrink-0 items-center whitespace-nowrap rounded-md border font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300',
            dark
              ? 'border-white/20 hover:bg-white/10'
              : 'border-slate-200 hover:bg-slate-50'
          )}
          style={{
            gap: 'min(4px, 1cqmin)',
            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(12px, 3.2cqmin)',
          }}
        >
          {t('flashcards.test.allQuestions')}
          <ChevronDown
            aria-hidden="true"
            className={cx('transition-transform', open && 'rotate-180')}
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
        </button>
      </nav>
      <div
        className={dark ? 'bg-white/10' : 'bg-slate-100'}
        style={{ height: 3 }}
        role="progressbar"
        aria-label={t('flashcards.test.answeredCount', {
          count: answeredCount,
          total,
        })}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answeredCount}
      >
        <div
          className="h-full bg-rose-600 transition-[width]"
          style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }}
        />
      </div>
      {open && (
        <div
          role="dialog"
          aria-label={t('flashcards.test.allQuestions')}
          className="absolute inset-x-0 top-full"
        >
          <div
            className={cx(
              'mx-auto w-full max-w-3xl border-b shadow-lg',
              dark
                ? 'border-white/15 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-800'
            )}
            style={{ padding: 'min(12px, 3cqmin) min(14px, 3.5cqmin)' }}
          >
            <div
              className={cx(
                'flex items-center',
                dark ? 'text-white/75' : 'text-slate-600'
              )}
              style={{
                gap: 'min(14px, 3.5cqmin)',
                fontSize: 'min(12px, 3.2cqmin)',
              }}
            >
              <span
                className="flex items-center"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                <span
                  aria-hidden="true"
                  className="inline-block rounded-sm bg-rose-600"
                  style={{ width: 10, height: 10 }}
                />
                {t('flashcards.test.answered')}
              </span>
              <span
                className="flex items-center"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'inline-block rounded-sm border',
                    dark ? 'border-white/40' : 'border-slate-300'
                  )}
                  style={{ width: 10, height: 10 }}
                />
                {t('flashcards.test.notAnswered')}
              </span>
              {nextUnanswered >= 0 && (
                <button // no-tour-anchor: student test player
                  type="button"
                  onClick={() => jump(nextUnanswered)}
                  className={cx(
                    'ml-auto font-bold underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300',
                    dark ? 'text-cyan-200' : 'text-rose-700'
                  )}
                >
                  {t('flashcards.test.nextUnanswered')}
                </button>
              )}
            </div>
            <ol
              className="grid overflow-y-auto"
              style={{
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(36px, 9cqmin), 1fr))',
                gap: 'min(6px, 1.5cqmin)',
                marginTop: 'min(10px, 2.5cqmin)',
                maxHeight: 'min(320px, 60cqh)',
                paddingBottom: 2,
              }}
            >
              {answered.map((done, index) => {
                const isCurrent = index === current;
                return (
                  <li key={index}>
                    <button // no-tour-anchor: student test player
                      type="button"
                      aria-label={t('flashcards.test.goTo', {
                        number: index + 1,
                      })}
                      aria-current={isCurrent ? 'step' : undefined}
                      onClick={() => jump(index)}
                      className={cx(
                        'flex w-full items-center justify-center rounded-md border font-bold tabular-nums transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300',
                        done
                          ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700'
                          : dark
                            ? 'border-white/25 text-white hover:bg-white/10'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                        isCurrent &&
                          (dark
                            ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-950'
                            : 'ring-2 ring-slate-900 ring-offset-1')
                      )}
                      style={{
                        height: 'min(34px, 8.5cqmin)',
                        fontSize: 'min(12px, 3.2cqmin)',
                      }}
                    >
                      {index + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};
