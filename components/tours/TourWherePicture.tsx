import React from 'react';
import type { TourMarkupShape } from '@/types';
import { TourPictureMarkup } from './TourPictureMarkup';
import { TargetRing } from './steps/StepPicture';

export interface TourWherePictureProps {
  src: string;
  alt: string;
  /** The picture's pixel size; unknown on older Live slides, which then take a 16:9 box. */
  w?: number;
  h?: number;
  /** Where the step's control sits, 0-1 of the picture; ringed when known. */
  target?: { x: number; y: number; w: number; h: number };
  markup?: readonly TourMarkupShape[];
  testId?: string;
}

/** A step's picture for Show me where: whole (never cropped), its control ringed like the Steps view, markup on top (TOURS_10X.md P4, E5). */
export const TourWherePicture: React.FC<TourWherePictureProps> = ({
  src,
  alt,
  w,
  h,
  target,
  markup,
  testId = 'tour-where-image',
}) => {
  const sized = !!w && !!h && w > 0 && h > 0;
  const ratio = sized ? w / h : 16 / 9;
  return (
    // The box takes the picture's own shape and fits the chip, so the picture is contained, never cut.
    <div
      className="relative mx-auto overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
      style={{
        aspectRatio: `${ratio}`,
        width: `min(100%, calc(16rem * ${ratio}))`,
      }}
    >
      <img
        src={src}
        alt={alt}
        decoding="async"
        data-testid={testId}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {sized && target && <TargetRing target={target} />}
      {sized && markup && markup.length > 0 && (
        <TourPictureMarkup shapes={markup} width={w} height={h} />
      )}
    </div>
  );
};
