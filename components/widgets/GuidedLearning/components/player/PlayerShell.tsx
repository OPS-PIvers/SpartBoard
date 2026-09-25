import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningMode, GuidedLearningPublicStep } from '@/types';
import { PROJECTOR_TEXT_VARS } from '../../utils/projectorTextVars';
import { SpeedControl } from './SpeedControl';
import { StepOutline } from './StepOutline';
import { FOOTER_BUTTON_SIZE, FOOTER_ICON_SIZE } from './playerLayout';

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
      className="flex items-center border-b border-white/10 flex-shrink-0 bg-slate-900/90 backdrop-blur-sm"
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
        className="flex items-center flex-shrink-0 border-t border-white/10 bg-slate-900/80 backdrop-blur-md"
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
          onClick={onClose}
          className="text-slate-300 hover:text-white transition-colors"
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
        className="text-white font-bold flex-1 truncate"
        style={{ fontSize: 'min(14px, 4cqmin)' }}
      >
        {title}
      </span>

      {playerV2 && (
        <span
          data-testid="gl-mode-chip"
          className="rounded-full bg-white/10 border border-white/15 text-slate-200 font-semibold whitespace-nowrap flex-shrink-0"
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
              className="text-slate-300 font-medium"
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
                <button
                  key={`image-${imageIndex}`}
                  onClick={() => onSelectImage?.(imageIndex)}
                  className={`rounded border font-bold transition-colors ${
                    imageIndex === currentImageIndex
                      ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                      : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
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
  'flex flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/15 text-white';
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
        className="text-slate-300 font-bold tabular-nums"
        style={{ fontSize: 'min(12px, 3.2cqmin)' }}
      >
        {stepIndex + 1} / {steps.length}
      </span>
    )}
    <span className={PREVIEW_BUTTON} style={FOOTER_BUTTON_SIZE}>
      <ChevronRight style={FOOTER_ICON_SIZE} />
    </span>
  </>
);
