import React from 'react';
import { MathText } from '@/components/common/MathText';
import {
  splitPictureLabels,
  type AnswerPicture,
} from '@/utils/quizAnswerImages';

/** Answer text with each picture-only label drawn as its picture; teachers also see the label. */
export const AnswerPictureText: React.FC<{
  text: string;
  pictures: ReadonlyMap<string, AnswerPicture>;
  /** Teacher views keep the label beside the picture so it matches exports. */
  showLabel?: boolean;
  /** CSS height of each picture. */
  size?: string;
}> = ({ text, pictures, showLabel = false, size = '2.5rem' }) => {
  if (pictures.size === 0) return <MathText text={text} />;
  return (
    <>
      {splitPictureLabels(text, pictures).map((part, i) =>
        part.kind === 'text' ? (
          <MathText key={i} text={part.text} />
        ) : (
          <span key={i} className="inline-flex items-center align-middle gap-1">
            <img
              src={part.picture.url}
              alt={showLabel ? '' : (part.picture.alt ?? 'Picture')}
              title={part.picture.alt}
              className="inline-block rounded-sm border border-slate-200 bg-white object-contain"
              style={{ height: size, maxWidth: `calc(${size} * 2)` }}
            />
            {showLabel && (
              <span>
                {part.label}
                {part.picture.alt ? (
                  <span className="sr-only">{`: ${part.picture.alt}`}</span>
                ) : null}
              </span>
            )}
          </span>
        )
      )}
    </>
  );
};
