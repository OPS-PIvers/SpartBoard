import React, { useMemo, memo } from 'react';

interface ScalableWidgetProps {
  width: number;
  height: number;
  baseWidth: number;
  baseHeight: number;
  canSpread?: boolean;
  padding?: number;
  headerHeight?: number;
  contentScaleMultiplier?: number;
  contentOffsetX?: number;
  contentOffsetY?: number;
  children:
    | React.ReactNode
    | ((props: {
        internalW: number;
        internalH: number;
        scale: number;
      }) => React.ReactNode);
}

const ScalableWidgetComponent: React.FC<ScalableWidgetProps> = ({
  width,
  height,
  baseWidth,
  baseHeight,
  canSpread = true,
  padding = 0,
  headerHeight = 0,
  contentScaleMultiplier = 1,
  contentOffsetX = 0,
  contentOffsetY = 0,
  children,
}) => {
  const safeContentScaleMultiplier =
    Number.isFinite(contentScaleMultiplier) && contentScaleMultiplier > 0
      ? contentScaleMultiplier
      : 1;

  const { scale, renderScale, internalW, internalH } = useMemo(() => {
    const availableW = Math.max(10, width - padding * 2);
    const availableH = Math.max(10, height - headerHeight - padding * 2);

    if (baseWidth <= 0 || baseHeight <= 0) {
      return {
        scale: 1 * safeContentScaleMultiplier,
        renderScale: 1 * safeContentScaleMultiplier,
        internalW: availableW / safeContentScaleMultiplier,
        internalH: availableH / safeContentScaleMultiplier,
      };
    }

    const scaleX = availableW / baseWidth;
    const scaleY = availableH / baseHeight;
    const baseScale = Math.min(scaleX, scaleY);

    if (canSpread) {
      // Keep renderScale as just the fit-to-container factor (capped at 1)
      const renderScale = Math.min(baseScale, 1);
      return {
        scale: baseScale * safeContentScaleMultiplier,
        renderScale,
        internalW: availableW / renderScale,
        internalH: availableH / renderScale,
      };
    }

    return {
      scale: baseScale * safeContentScaleMultiplier,
      renderScale: baseScale,
      internalW: baseWidth,
      internalH: baseHeight,
    };
  }, [
    width,
    height,
    baseWidth,
    baseHeight,
    canSpread,
    padding,
    headerHeight,
    safeContentScaleMultiplier,
  ]);

  const renderContent = () => {
    if (typeof children === 'function') {
      return children({ internalW, internalH, scale });
    }
    return children;
  };

  return (
    <div
      className="scalable-widget-container"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: padding,
        boxSizing: 'border-box',
      }}
    >
      <div
        className="scalable-widget-content"
        style={{
          width: internalW,
          height: internalH,
          transform: `translate(calc(${contentOffsetX}px + var(--transient-pan-x, 0px)), calc(${contentOffsetY}px + var(--transient-pan-y, 0px))) scale(calc(${renderScale} * ${safeContentScaleMultiplier} * var(--transient-zoom, 1)))`,
          transformOrigin:
            'var(--pinch-origin-x, 50%) var(--pinch-origin-y, 50%)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          willChange: 'transform',
          overflow: 'visible',
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
};

export const ScalableWidget = memo(ScalableWidgetComponent);
