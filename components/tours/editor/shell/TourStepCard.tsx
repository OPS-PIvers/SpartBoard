import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import { focusRing } from '@/components/common/lightChrome';
import { cardInput, cardLabel, stepTitleFieldId } from './stepCardParts';

interface TourStepCardProps {
  stepId: string;
  title: string;
  tip: string;
  onTitle: (value: string) => void;
  onTip: (value: string) => void;
  /** The step's picture; its tools show only while it is selected. */
  picture?: {
    node: React.ReactNode;
    tools?: React.ReactNode;
    dimmed?: boolean;
  } | null;
  /** What the learner does: the kind's target and action fields. */
  type: React.ReactNode;
  /** Rare tools, collapsed under More. */
  more?: React.ReactNode;
  footer?: React.ReactNode;
}

/** The selected step: Title, Tip and Type, rare tools under a collapsed More. */
export const TourStepCard: React.FC<TourStepCardProps> = ({
  stepId,
  title,
  tip,
  onTitle,
  onTip,
  picture,
  type,
  more,
  footer,
}) => {
  const { t } = useTranslation();
  const [pictureSelected, setPictureSelected] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = `tour-step-more-${stepId}`;
  return (
    <div
      data-testid="tour-editor-card"
      className="flex flex-col gap-3 px-3 pb-3 pl-[42px] pt-1"
    >
      {picture && (
        <div className="relative">
          {/* no-tour-anchor: selects the picture to show its tools */}
          <button
            type="button"
            aria-pressed={pictureSelected}
            aria-label={t('tours.shell.selectPicture')}
            data-testid="tour-step-picture"
            onClick={() => setPictureSelected((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPictureSelected(false);
            }}
            className={`block w-full rounded-lg ${focusRing} ${
              pictureSelected
                ? 'ring-2 ring-brand-blue-primary ring-offset-1'
                : ''
            } ${picture.dimmed ? 'opacity-50' : ''}`}
          >
            {picture.node}
          </button>
          {pictureSelected && picture.tools && (
            <div
              role="toolbar"
              aria-label={t('tours.shell.pictureTools')}
              data-testid="tour-step-picture-tools"
              className="absolute right-1.5 top-1.5 flex gap-1"
            >
              {picture.tools}
            </div>
          )}
        </div>
      )}
      <label className={cardLabel}>
        {t('glStudio.stepTitle')}
        <input
          id={stepTitleFieldId(stepId)}
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          className={cardInput}
        />
      </label>
      <label className={cardLabel}>
        {t('tours.shell.tip')}
        <textarea
          rows={3}
          value={tip}
          onChange={(e) => onTip(e.target.value)}
          className={`${cardInput} resize-y`}
        />
      </label>
      {type}
      {more && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            data-testid="tour-step-more"
            onClick={() => setMoreOpen((v) => !v)}
            className={`-ml-1 flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
            {...tourAttr('tour-editor.step-more')}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
                moreOpen ? 'rotate-90' : ''
              }`}
              aria-hidden="true"
            />
            {t('tours.shell.more')}
          </button>
          {moreOpen && (
            <div
              id={moreId}
              data-testid="tour-step-more-body"
              className="flex flex-col gap-3 border-l-2 border-slate-100 pl-3"
            >
              {more}
            </div>
          )}
        </div>
      )}
      {footer}
    </div>
  );
};
