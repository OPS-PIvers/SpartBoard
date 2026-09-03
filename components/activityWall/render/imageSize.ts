import { createContext, useContext } from 'react';

export type WallImageSize = 'small' | 'medium' | 'large';

export const WALL_IMAGE_SIZES: WallImageSize[] = ['small', 'medium', 'large'];

export const WALL_IMAGE_SIZE_LABEL: Record<WallImageSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

/** Next size in the small → medium → large → small cycle. */
export const nextWallImageSize = (size: WallImageSize): WallImageSize =>
  WALL_IMAGE_SIZES[
    (WALL_IMAGE_SIZES.indexOf(size) + 1) % WALL_IMAGE_SIZES.length
  ];

export const isWallImageSize = (value: unknown): value is WallImageSize =>
  typeof value === 'string' && (WALL_IMAGE_SIZES as string[]).includes(value);

/** Photo caps per size; the widget face uses cqmin, other modes use px only. */
export const wallImageDimensions = (
  size: WallImageSize,
  isWidget: boolean
): { maxHeight: string; maxWidth: string } => {
  switch (size) {
    case 'small':
      return isWidget
        ? { maxHeight: 'min(140px, 28cqmin)', maxWidth: 'min(260px, 45cqmin)' }
        : { maxHeight: '160px', maxWidth: '300px' };
    case 'large':
      return isWidget
        ? { maxHeight: 'min(420px, 70cqmin)', maxWidth: 'min(720px, 90cqmin)' }
        : { maxHeight: '520px', maxWidth: '100%' };
    default:
      return isWidget
        ? { maxHeight: 'min(220px, 40cqmin)', maxWidth: 'min(420px, 60cqmin)' }
        : { maxHeight: '320px', maxWidth: '520px' };
  }
};

export const WallImageSizeContext = createContext<WallImageSize>('medium');

export const useWallImageSize = (): WallImageSize =>
  useContext(WallImageSizeContext);

/** Inline overrides for the submission card surface; unset keeps the default glass card. */
export interface WallCardStyle {
  background?: string;
  color?: string;
}

export const WallCardStyleContext = createContext<WallCardStyle>({});

export const useWallCardStyle = (): WallCardStyle =>
  useContext(WallCardStyleContext);
