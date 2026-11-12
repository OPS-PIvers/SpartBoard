// Named stimulus tabs in the panel beside a question (docs/plans/QUIZ_MCA_PRACTICE.md M11–M14); every tab stays mounted so a PDF or calculator keeps its place.
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizStimulus } from '@/types';
import { activeStimulusTab, stimulusTabLabels } from '@/utils/quizStimulusTabs';

export const StimulusTabsPanel: React.FC<{
  stimuli: QuizStimulus[];
  light: boolean;
  renderStimulus: (s: QuizStimulus) => React.ReactNode;
}> = ({ stimuli, light, renderStimulus }) => {
  const { t } = useTranslation();
  const [chosen, setChosen] = React.useState<string | null>(null);
  const active = activeStimulusTab(stimuli, chosen);
  const labels = stimulusTabLabels(stimuli, {
    calculator: t('quizStimulusTabs.calculator', 'Calculator'),
    numbered: (n) => t('quizStimulusTabs.numbered', 'Tab {{n}}', { n }),
  });
  const baseId = React.useId();
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  if (stimuli.length < 2) {
    return (
      <>
        {stimuli.map((s) => (
          <div key={s.id} className="flex-1 min-h-[280px] flex flex-col">
            {renderStimulus(s)}
          </div>
        ))}
      </>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = stimuli.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setChosen(stimuli[next].id);
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
    <div className="flex-1 min-h-[280px] flex flex-col">
      <div
        role="tablist"
        aria-label={t('quizStimulusTabs.sources', 'Sources')}
        className={`flex gap-1 p-1 max-w-full self-start overflow-x-auto overflow-y-hidden shrink-0 rounded-xl ${light ? 'bg-slate-200/70' : 'bg-slate-800'}`}
      >
        {stimuli.map((s, i) => {
          const selected = s.id === active;
          return (
            <button
              // no-tour-anchor: student quiz screen; tours walk teachers
              key={s.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${i}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setChosen(s.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`shrink-0 min-h-[44px] px-4 rounded-lg text-sm font-bold whitespace-nowrap transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${tabCls(selected)}`}
            >
              {labels[i]}
            </button>
          );
        })}
      </div>
      {stimuli.map((s, i) => (
        <div
          key={s.id}
          role="tabpanel"
          id={`${baseId}-panel-${i}`}
          aria-labelledby={`${baseId}-tab-${i}`}
          hidden={s.id !== active}
          className={s.id === active ? 'flex-1 min-h-0 flex flex-col pt-3' : ''}
        >
          {renderStimulus(s)}
        </div>
      ))}
    </div>
  );
};
