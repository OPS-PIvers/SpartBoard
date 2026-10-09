import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningMode, GuidedLearningPublicStep } from '@/types';
import { chromeMuted, iconBtn } from '@/components/common/lightChrome';
import { PROJECTOR_TEXT_VARS } from '../../utils/projectorTextVars';
import { SpeedControl } from './SpeedControl';
import { StepOutline } from './StepOutline';
import { FOOTER_BUTTON_SIZE, FOOTER_ICON_SIZE } from './playerLayout';
import { tourAttr } from '@/config/tourAnchors';

interface PlayerShellProps {
  topBar: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  playerV2?: boolean;
  rootRef?: React.Ref<HTMLDivElement>;
  stageRef?: React.Ref<HTMLDivElement>;
  /** Studio canvas: the bars are a preview, not controls. */
  inertChrome?: boolean;
  testId?: string;
}

/** Top bar, stage and footer shared by the player and the Studio canvas; the root is the cqmin box. */
export const PlayerShell: React.FC<PlayerShellProps> = ({
  topBar,
  footer,
  children,
  playerV2,
  rootRef,
  stageRef,
  inertChrome,
  testId = 'gl-player-root',
}) => (
  <div
    ref={rootRef}
    data-testid={testId}
    className="h-full flex flex-col bg-slate-900"
    style={{
      containerType: 'size',
      ...(playerV2 ? PROJECTOR_TEXT_VARS : undefined),
    }}
  >
    <div
      data-gl-topbar=""
      inert={inertChrome ? true : undefined}
      aria-hidden={inertChrome ? true : undefined}
      className="flex items-center border-b border-slate-200 flex-shrink-0 bg-white"
      style={{
        gap: 'min(8px, 2cqmin)',
        padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
      }}
    >
      {topBar}
    </div>
    <div
      ref={stageRef}
      data-testid="gl-player-stage"
      className="flex-1 relative overflow-hidden bg-slate-950"
    >
      {children}
    </div>
    {footer && (
      <div
        data-gl-footer
        inert={inertChrome ? true : undefined}
        aria-hidden={inertChrome ? true : undefined}
        className="flex items-center flex-shrink-0 border-t border-slate-200 bg-white"
        style={{
          gap: 'min(10px, 2.5cqmin)',
          padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
        }}
      >
        {footer}
      </div>
    )}
  </div>
);

interface PlayerTopBarProps {
  title: string;
  mode: GuidedLearningMode;
  playerV2?: boolean;
  onClose?: () => void;
  imageCount: number;
  currentImageIndex: number;
  onSelectImage?: (imageIndex: number) => void;
}

/** The player's controls bar: close, title, mode chip and explore's slide buttons. */
export const PlayerTopBar: React.FC<PlayerTopBarProps> = ({
  title,
  mode,
  playerV2,
  onClose,
  imageCount,
  currentImageIndex,
  onSelectImage,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {onClose && (
        <button
          {...tourAttr('gl-player.close')}
          onClick={onClose}
          className={`${iconBtn} transition-colors`}
          aria-label={t('glPlayer.closePlayer')}
        >
          <X
            aria-hidden="true"
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
      )}
      <span
        className="text-slate-900 font-bold flex-1 truncate"
        style={{ fontSize: 'min(14px, 4cqmin)' }}
      >
        {title}
      </span>

      {playerV2 && (
        <span
          data-testid="gl-mode-chip"
          className="rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-semibold whitespace-nowrap flex-shrink-0"
          style={{
            padding: 'min(3px, 0.8cqmin) min(10px, 2.4cqmin)',
            fontSize: 'var(--gl-text-small, min(12px, 3.2cqmin))',
          }}
        >
          {t(`glPlayer.modeChip.${mode}`)}
        </span>
      )}

      {mode === 'explore' && (
        <div
          className="flex items-center flex-wrap"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          {!playerV2 && (
            <span
              className={`${chromeMuted} font-medium`}
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              {t('glPlayer.exploreHint')}
            </span>
          )}
          {imageCount > 1 && (
            <div
              className="flex items-center flex-wrap"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {Array.from({ length: imageCount }, (_, imageIndex) => (
                // eslint-disable-next-line no-restricted-syntax -- a pager with one tab per image
                <button
                  key={`image-${imageIndex}`}
                  {...tourAttr('gl-player.slide-thumb')}
                  onClick={() => onSelectImage?.(imageIndex)}
                  className={`rounded border font-bold transition-colors ${
                    imageIndex === currentImageIndex
                      ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary'
                      : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  style={{
                    padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                    fontSize: 'min(10px, 2.6cqmin)',
                  }}
                  aria-label={t('glPlayer.showSlide', { n: imageIndex + 1 })}
                >
                  {t('glPlayer.outline.slide', { n: imageIndex + 1 })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

const PREVIEW_BUTTON =
  'flex flex-shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-700';
const PREVIEW_NEXT =
  'flex flex-shrink-0 items-center justify-center rounded-full bg-brand-blue-primary text-white';
const NO_DONE: ReadonlySet<string> = new Set();
const noop = () => undefined;
const never = () => false;

interface PlayerFooterPreviewProps {
  steps: readonly GuidedLearningPublicStep[];
  stepIndex: number;
  playerV2?: boolean;
  /** The frame is narrower than FOOTER_COMPACT_PX, so speed sits in the overflow menu. */
  compact: boolean;
}

/** Studio canvas footer: the player footer's controls at their real sizes, shown inert. */
export const PlayerFooterPreview: React.FC<PlayerFooterPreviewProps> = ({
  steps,
  stepIndex,
  playerV2,
  compact,
}) => (
  <>
    <span className={PREVIEW_BUTTON} style={FOOTER_BUTTON_SIZE}>
      <ChevronLeft style={FOOTER_ICON_SIZE} />
    </span>
    <div className="flex-1" />
    {playerV2 && !compact && <SpeedControl speed={1} onChange={noop} />}
    {playerV2 ? (
      <StepOutline
        steps={steps as GuidedLearningPublicStep[]}
        currentIdx={stepIndex}
        doneIds={NO_DONE}
        showSlides={false}
        canJump={never}
        onJump={noop}
      />
    ) : (
      <span
        className="text-slate-700 font-bold tabular-nums"
        style={{ fontSize: 'min(12px, 3.2cqmin)' }}
      >
        {stepIndex + 1} / {steps.length}
      </span>
    )}
    <span className={PREVIEW_NEXT} style={FOOTER_BUTTON_SIZE}>
      <ChevronRight style={FOOTER_ICON_SIZE} />
    </span>
  </>
);
