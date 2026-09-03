import React, { useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { ActivityWallAppearance } from '@/types';
import { ACTIVITY_WALL_DEFAULT_APPEARANCE } from '@/types';
import {
  WALL_IMAGE_SIZE_LABEL,
  nextWallImageSize,
  type WallImageSize,
} from '@/components/activityWall/render';

interface WallShellProps {
  appearance?: ActivityWallAppearance;
  title?: string;
  prompt?: string;
  /** Open / Closed chip; omitted while the wall is still loading. */
  open?: boolean;
  imageSize?: WallImageSize;
  onImageSizeChange?: (size: WallImageSize) => void;
  children: React.ReactNode;
}

/** Full-viewport, chrome-free wall page: compact header over the wall appearance, children fill the rest. */
export const WallShell: React.FC<WallShellProps> = ({
  appearance,
  title,
  prompt,
  open,
  imageSize,
  onImageSizeChange,
  children,
}) => {
  const resolved = appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE;
  const isImage = resolved.kind === 'image';

  // Marks the document body chrome-free for the app shell (external DOM system).
  useEffect(() => {
    document.body.dataset.chromeFree = 'true';
    return () => {
      delete document.body.dataset.chromeFree;
    };
  }, []);

  const showHeader = Boolean(title) || Boolean(prompt) || open !== undefined;

  return (
    <div
      data-chrome-free="true"
      className={`flex h-screen h-dvh w-full flex-col overflow-hidden bg-slate-900 bg-cover bg-center ${
        isImage ? '' : resolved.value
      }`}
      style={
        isImage ? { backgroundImage: `url(${resolved.value})` } : undefined
      }
    >
      {showHeader && (
        <header className="shrink-0 bg-brand-blue-primary text-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
            <div className="min-w-0 flex-1">
              {title && (
                <h1 className="truncate text-lg font-black sm:text-2xl">
                  {title}
                </h1>
              )}
              {prompt && (
                <p className="truncate text-sm text-white/90 sm:text-base">
                  {prompt}
                </p>
              )}
            </div>
            {imageSize && onImageSizeChange && (
              <button
                type="button"
                onClick={() => onImageSizeChange(nextWallImageSize(imageSize))}
                aria-label={`Image size: ${WALL_IMAGE_SIZE_LABEL[imageSize]}. Click to change.`}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-3 py-1 text-sm font-bold transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <ImageIcon aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">Images:</span>{' '}
                {WALL_IMAGE_SIZE_LABEL[imageSize]}
              </button>
            )}
            {open !== undefined && (
              <span
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${
                  open ? 'bg-emerald-500/90' : 'bg-white/20'
                }`}
              >
                {open ? 'Open' : 'Closed'}
              </span>
            )}
          </div>
        </header>
      )}
      <main role="main" className="relative min-h-0 flex-1">
        {children}
      </main>
    </div>
  );
};

/** Centered light card for arrival, not-found, and notice states. */
export const WallCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="flex h-full items-start justify-center overflow-y-auto p-4 sm:p-6">
    <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
      {children}
    </div>
  </div>
);
