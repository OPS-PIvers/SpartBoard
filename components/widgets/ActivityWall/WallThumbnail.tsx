import React from 'react';
import type { ActivityWallLibraryEntry } from '@/types';
import { ACTIVITY_WALL_DEFAULT_APPEARANCE } from '@/types';
import { LAYOUT_OPTIONS } from './editor/layoutOptions';

const layoutSketch = (entry: ActivityWallLibraryEntry): React.ReactNode =>
  LAYOUT_OPTIONS.find((option) => option.layout === entry.layout)?.sketch ??
  null;

/** Appearance swatch + layout sketch shown as the card thumbnail. */
export const WallThumbnail: React.FC<{ entry: ActivityWallLibraryEntry }> = ({
  entry,
}) => {
  const appearance = entry.appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE;
  const isImage = appearance.kind === 'image';
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-lg bg-cover bg-center ${
        isImage ? '' : appearance.value
      }`}
      style={
        isImage ? { backgroundImage: `url(${appearance.value})` } : undefined
      }
    >
      <div className="h-10 w-16 text-white/90">{layoutSketch(entry)}</div>
    </div>
  );
};
