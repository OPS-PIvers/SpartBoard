import React from 'react';
import { Check, Plus } from 'lucide-react';
import { PICKER_ADD } from './stimulusPickerSelection';
import type {
  QuizStimulus,
  QuizStimulusPaperPlacement,
  QuizStimulusType,
} from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { paperPlacementOf } from '@/utils/paperTestStimuli';
import { Modal } from '@/components/common/Modal';
import { ModalHeader } from '@/components/common/ModalHeader';
import { AutosaveIndicator } from '@/components/common/EditorModalShell';
import { useEditorAutosave } from '@/components/common/editorAutosaveContext';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { StimulusRenderer } from '@/components/quiz/QuizStimulusView';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  STIMULUS_TYPE_LABELS,
  isEmptyTextStimulus,
  stimulusPickerTitle,
} from '@/utils/quizStimuli';

const ADD = PICKER_ADD;

const TYPE_TEXT: Record<QuizStimulusType, string> = {
  image: 'text-emerald-700',
  pdf: 'text-red-700',
  audio: 'text-amber-800',
  video: 'text-blue-700',
  youtube: 'text-rose-700',
  'gdoc-embed': 'text-indigo-700',
  text: 'text-slate-600',
  'word-bank': 'text-sky-800',
  calculator: 'text-teal-700',
};

/** Picks the stimuli for one question or bank slot: list on the left, preview on the right. */
export const StimulusPickerModal: React.FC<{
  stimuli: QuizStimulus[];
  attachedIds: string[] | undefined;
  /** "question" or "bank": names what the stimuli attach to. */
  ownerNoun: 'question' | 'bank';
  /** Short name on the add button, e.g. "Q3". */
  ownerLabel: string;
  /** Where each stimulus is used, e.g. "Q1, Q3". */
  usedOn: (stimulusId: string) => string[];
  onToggle: (stimulusId: string) => void;
  /** A stimulus id, or PICKER_ADD for the add sources. */
  selectedId: string;
  onSelect: (id: string) => void;
  /** Upload, Drive, link and calculator sources. */
  addArea: React.ReactNode;
  /** Paper tests are on: each stimulus gets an "On paper" switch. */
  onPaperPlacement?: (
    stimulusId: string,
    placement: QuizStimulusPaperPlacement
  ) => void;
  onClose: () => void;
}> = ({
  stimuli,
  attachedIds,
  ownerNoun,
  ownerLabel,
  usedOn,
  onToggle,
  selectedId,
  onSelect: setSelectedId,
  addArea,
  onPaperPlacement,
  onClose,
}) => {
  const selected = stimuli.find((s) => s.id === selectedId) ?? null;
  const isAttached = (id: string) => attachedIds?.includes(id) ?? false;
  const attachedCount = stimuli.filter((s) => isAttached(s.id)).length;

  const usageText = (id: string) => {
    const on = usedOn(id);
    return on.length > 0 ? `On ${on.join(', ')}` : 'Not used';
  };

  const title = `Stimuli for this ${ownerNoun}`;
  const autosave = useEditorAutosave();

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel={title}
      customHeader={
        <ModalHeader
          title={title}
          accent={LIBRARY_HEADER_ACCENTS.quiz}
          actions={
            <>
              {autosave && (
                <AutosaveIndicator
                  status={autosave.status}
                  onRetry={() => void autosave.flush()}
                  onAccent
                />
              )}
              <button
                type="button"
                onClick={onClose}
                {...tourTypeAttr('quiz-stimuli.picker-close', 'quiz')}
                className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-white/90"
              >
                Return
              </button>
            </>
          }
        />
      }
      zIndex="z-modal-deep"
      maxWidth="max-w-5xl"
      contentClassName="p-0"
    >
      <div className="flex h-[min(calc(90vh-4.5rem),680px)] flex-col sm:flex-row">
        <div className="flex max-h-[50%] shrink-0 flex-col border-b border-slate-200 bg-slate-100 sm:max-h-none sm:w-80 sm:border-b-0 sm:border-r">
          <div className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              In this quiz
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {attachedCount} attached
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-200 border-t border-slate-200 pb-2">
            {stimuli.map((s, index) => {
              const attached = isAttached(s.id);
              const active = s.id === selectedId;
              const title = stimulusPickerTitle(s, stimuli);
              const empty = isEmptyTextStimulus(s);
              return (
                <li
                  key={s.id}
                  className={`flex items-stretch ${
                    active
                      ? 'bg-white ring-2 ring-inset ring-brand-blue-primary'
                      : 'hover:bg-slate-200/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggle(s.id)}
                    aria-pressed={attached}
                    aria-label={`${attached ? 'Remove' : 'Add'} ${title}`}
                    title={attached ? 'Remove' : `Add to ${ownerLabel}`}
                    {...tourFieldAttr(
                      'quiz-stimuli.attach-stimulus',
                      'quiz',
                      String(index + 1)
                    )}
                    className="flex shrink-0 items-center pl-4 pr-2 [-webkit-tap-highlight-color:transparent]"
                  >
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors ${
                        attached
                          ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {attached && (
                        <Check
                          className="h-3 w-3"
                          strokeWidth={3}
                          aria-hidden
                        />
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-current={active ? 'true' : undefined}
                    {...tourFieldAttr(
                      'quiz-stimuli.attach-preview',
                      'quiz',
                      String(index + 1)
                    )}
                    className="min-w-0 flex-1 py-2.5 pr-4 text-left [-webkit-tap-highlight-color:transparent]"
                  >
                    <span
                      className={`block break-words text-sm leading-snug ${
                        active
                          ? 'font-semibold text-slate-900'
                          : 'text-slate-800'
                      }`}
                    >
                      {title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span
                        className={`font-bold uppercase tracking-wider text-xxs ${TYPE_TEXT[s.type]}`}
                      >
                        {STIMULUS_TYPE_LABELS[s.type]}
                      </span>
                      <span className="text-slate-500">
                        {empty ? 'Empty' : usageText(s.id)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setSelectedId(ADD)}
            aria-current={selectedId === ADD ? 'true' : undefined}
            {...tourTypeAttr('quiz-stimuli.picker-add', 'quiz')}
            className={`flex w-full shrink-0 items-center gap-2 border-t border-slate-200 px-4 py-3 text-left text-sm font-semibold text-brand-blue-primary [-webkit-tap-highlight-color:transparent] ${
              selectedId === ADD
                ? 'bg-white ring-2 ring-inset ring-brand-blue-primary'
                : 'hover:bg-slate-200/60'
            }`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add a stimulus
          </button>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 px-5 py-3">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-bold text-slate-800">
                    {stimulusPickerTitle(selected, stimuli)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {STIMULUS_TYPE_LABELS[selected.type]} ·{' '}
                    {usageText(selected.id)}
                  </p>
                </div>
                {onPaperPlacement && selected.type !== 'calculator' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      On paper
                    </span>
                    <SegmentedControl
                      role="radiogroup"
                      ariaLabel="On paper"
                      value={paperPlacementOf(
                        selected,
                        usedOn(selected.id).length
                      )}
                      onChange={(v) => onPaperPlacement(selected.id, v)}
                      anchor={tourTypeAttr(
                        'quiz-stimuli.paper-placement',
                        'quiz'
                      )}
                      options={[
                        { value: 'question', label: 'With the question' },
                        { value: 'resource', label: 'Resource page' },
                      ]}
                    />
                  </div>
                )}
              </div>
              <div
                data-testid="attach-stimulus-preview"
                className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-6 pt-4"
              >
                {isEmptyTextStimulus(selected) ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <p className="text-sm font-semibold text-slate-700">
                      This {STIMULUS_TYPE_LABELS[selected.type].toLowerCase()}{' '}
                      is empty.
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add its text on the Stimuli tab.
                    </p>
                  </div>
                ) : (
                  <StimulusRenderer
                    key={selected.id}
                    stimulus={selected}
                    light
                    enforcePlayLimit={false}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-6 pt-4">
              <h3 className="mb-3 text-base font-bold text-slate-800">
                Add a stimulus
              </h3>
              <div className="space-y-2">{addArea}</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
