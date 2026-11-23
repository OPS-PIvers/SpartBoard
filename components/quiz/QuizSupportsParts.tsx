// The student's Supports toggle and side panel: teacher-provided text, links and Drive files, all shown inside the quiz.
import React, { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LifeBuoy, X } from 'lucide-react';
import type { QuizSupport } from '@/types';
import { embeddableSupportUrl } from '@/utils/quizSupportEmbed';
import {
  SUPPORTS_PCT_DEFAULT,
  SUPPORTS_PCT_MAX,
  SUPPORTS_PCT_MIN,
  clampSupportsPct,
  supportsPctForKey,
} from '@/utils/quizSupportsPanel';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export const SupportsButton: React.FC<{
  light: boolean;
  open: boolean;
  onToggle: () => void;
}> = ({ light, open, onToggle }) => {
  const { t } = useTranslation();
  return (
    <button
      {...tourAttr('student.quiz.supports')}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="quiz-supports-panel"
      className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold ${
        light
          ? 'text-brand-blue-primary hover:bg-slate-100'
          : 'text-slate-200 hover:bg-slate-800'
      }`}
    >
      <LifeBuoy className="h-4 w-4" aria-hidden />
      {t('quizSupports.button', 'Supports')}
    </button>
  );
};

const SupportBody: React.FC<{ support: QuizSupport; light: boolean }> = ({
  support,
  light,
}) => {
  if (support.kind === 'text')
    return (
      <p
        className={`whitespace-pre-line leading-relaxed ${light ? 'text-slate-800' : 'text-slate-100'}`}
      >
        {support.text}
      </p>
    );
  const src = embeddableSupportUrl(support);
  if (!src) return null;
  return (
    <iframe
      title={support.title}
      src={src}
      // No popups or top navigation, so a support can't take the student out of the quiz.
      sandbox="allow-scripts allow-same-origin allow-forms"
      referrerPolicy="no-referrer"
      className="min-h-[280px] w-full flex-1 rounded-lg border border-slate-200 bg-white"
    />
  );
};

/** Panel beside the question; one support shows directly, several get tabs. */
export const SupportsPanel: React.FC<{
  supports: QuizSupport[];
  light: boolean;
  onClose: () => void;
}> = ({ supports, light, onClose }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const current = Math.min(active, supports.length - 1);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = supports.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const tabCls = (selected: boolean) =>
    selected
      ? light
        ? 'bg-white text-brand-blue-primary shadow-sm'
        : 'bg-slate-600 text-white shadow-sm'
      : light
        ? 'text-slate-600 hover:text-slate-900'
        : 'text-slate-300 hover:text-white';

  return (
    <aside
      id="quiz-supports-panel"
      aria-label={t('quizSupports.title', 'Supports')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 items-center gap-2 pb-2">
        <LifeBuoy
          className={`h-4 w-4 ${light ? 'text-brand-blue-primary' : 'text-slate-200'}`}
          aria-hidden
        />
        <h2
          className={`min-w-0 flex-1 truncate text-sm font-bold ${light ? 'text-slate-800' : 'text-slate-100'}`}
        >
          {supports.length === 1
            ? supports[0].title
            : t('quizSupports.title', 'Supports')}
        </h2>
        <button
          {...tourAttr('student.quiz.supports-close')}
          type="button"
          onClick={onClose}
          aria-label={t('quizSupports.close', 'Close')}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${
            light
              ? 'text-slate-500 hover:bg-slate-100'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {supports.length > 1 && (
        <div
          role="tablist"
          aria-label={t('quizSupports.title', 'Supports')}
          className={`flex max-w-full shrink-0 gap-1 self-start overflow-x-auto overflow-y-hidden rounded-xl p-1 ${light ? 'bg-slate-200/70' : 'bg-slate-800'}`}
        >
          {supports.map((s, i) => (
            <button
              {...tourFieldAttr(
                'student.quiz.supports-tab',
                'quiz-student',
                `row-${i + 1}`
              )}
              key={`${s.kind}-${i}`}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${i}`}
              aria-selected={i === current}
              aria-controls={`${baseId}-panel-${i}`}
              tabIndex={i === current ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`min-h-[44px] max-w-[14rem] shrink-0 truncate rounded-lg px-4 text-sm font-bold transition-colors [-webkit-tap-highlight-color:transparent] ${tabCls(i === current)}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
      {supports.map((s, i) => (
        <div
          key={`${s.kind}-${i}`}
          role={supports.length > 1 ? 'tabpanel' : undefined}
          id={`${baseId}-panel-${i}`}
          aria-labelledby={
            supports.length > 1 ? `${baseId}-tab-${i}` : undefined
          }
          hidden={i !== current}
          className={
            i === current
              ? 'flex min-h-0 flex-1 flex-col overflow-y-auto pt-3'
              : ''
          }
        >
          <SupportBody support={s} light={light} />
        </div>
      ))}
    </aside>
  );
};

/** Drag bar between Supports and the sources in the left panel. */
export const SupportsDivider: React.FC<{
  pct: number;
  onChange: (pct: number) => void;
  light: boolean;
}> = ({ pct, onChange, light }) => {
  const { t } = useTranslation();
  const dragging = useRef(false);
  const moveTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const col = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!col || col.height <= 0) return;
    onChange(clampSupportsPct(((e.clientY - col.top) / col.height) * 100));
  };
  return (
    <div
      {...tourAttr('student.quiz.supports-resize')}
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('quizSupports.resize', 'Resize supports')}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={SUPPORTS_PCT_MIN}
      aria-valuemax={SUPPORTS_PCT_MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging.current) moveTo(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onDoubleClick={() => onChange(SUPPORTS_PCT_DEFAULT)}
      onKeyDown={(e) => {
        const next = supportsPctForKey(e.key, pct);
        if (next === null) return;
        e.preventDefault();
        onChange(next);
      }}
      className="group relative hidden h-4 shrink-0 cursor-row-resize touch-none select-none items-center justify-center touch-target-expand [-webkit-tap-highlight-color:transparent] focus-visible:outline-hidden lg:flex"
    >
      <span
        aria-hidden
        className={`h-px w-full transition-colors group-hover:bg-brand-blue-primary group-focus-visible:bg-brand-blue-primary ${light ? 'bg-slate-300' : 'bg-slate-600'}`}
      />
      <span
        aria-hidden
        className={`absolute h-1.5 w-14 rounded-full transition-colors group-hover:bg-brand-blue-primary group-focus-visible:bg-brand-blue-primary group-focus-visible:ring-2 group-focus-visible:ring-brand-blue-primary/40 ${light ? 'bg-slate-400' : 'bg-slate-500'}`}
      />
    </div>
  );
};
