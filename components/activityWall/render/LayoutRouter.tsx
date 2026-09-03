import React, { Suspense, lazy } from 'react';
import { ACTIVITY_WALL_DEFAULT_APPEARANCE } from '@/types';
import { WallLayout } from './WallLayout';
import { ColumnsLayout } from './ColumnsLayout';
import { TableLayout } from './TableLayout';
import { TimelineLayout } from './TimelineLayout';
import { WordCloudLayout } from './WordCloudLayout';
import { wallScale } from './scale';
import type { WallRenderProps } from './types';
import { WallCardStyleContext, WallImageSizeContext } from './imageSize';

export type {
  WallRenderProps,
  WallRenderMode,
  WallMovePatch,
  WallPlacement,
} from './types';

// Leaflet stays out of the main bundle; MapLayout imports its own CSS.
const MapLayout = lazy(() => import('./MapLayout'));

const EMPTY_CARD_STYLE = {};

/** Renders the wall's layout and paints the wall appearance behind it. */
export const LayoutRouter: React.FC<WallRenderProps> = (props) => {
  const {
    session,
    mode,
    appearance,
    imageSize = 'medium',
    cardStyle = EMPTY_CARD_STYLE,
  } = props;
  const scale = wallScale(mode);
  const resolved =
    appearance ?? session.appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE;
  const isImage = resolved.kind === 'image';

  const layout = (() => {
    switch (session.layout ?? 'wall') {
      case 'columns':
        return <ColumnsLayout {...props} />;
      case 'table':
        return <TableLayout {...props} />;
      case 'timeline':
        return <TimelineLayout {...props} />;
      case 'wordcloud':
        return <WordCloudLayout {...props} />;
      case 'map':
        return (
          <Suspense
            fallback={
              <div
                className="flex h-full w-full items-center justify-center text-slate-300"
                style={{ fontSize: scale.meta }}
              >
                Loading map…
              </div>
            }
          >
            <MapLayout {...props} />
          </Suspense>
        );
      default:
        return <WallLayout {...props} />;
    }
  })();

  return (
    <div
      className={`h-full w-full bg-cover bg-center ${isImage ? '' : resolved.value}`}
      style={
        isImage ? { backgroundImage: `url(${resolved.value})` } : undefined
      }
      data-testid="aw-layout-router"
    >
      <WallImageSizeContext.Provider value={imageSize}>
        <WallCardStyleContext.Provider value={cardStyle}>
          {layout}
        </WallCardStyleContext.Provider>
      </WallImageSizeContext.Provider>
    </div>
  );
};

export default LayoutRouter;
