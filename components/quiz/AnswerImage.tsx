import React from 'react';

/** Picture beside an answer's text; the text names it, and chips must not start a native image drag. */
export const AnswerImage: React.FC<{ src: string; large?: boolean }> = ({
  src,
  large,
}) => (
  <img
    src={src}
    alt=""
    draggable={false}
    className={`rounded-lg object-contain bg-white shrink-0 pointer-events-none ${large ? 'w-24 h-24' : 'w-14 h-14'}`}
  />
);

/** An answer's text, with its picture when it has one. */
export const AnswerLabel: React.FC<{
  label: React.ReactNode;
  image?: string;
  large?: boolean;
}> = ({ label, image, large }) =>
  image ? (
    <span className="flex items-center gap-3">
      <AnswerImage src={image} large={large} />
      <span className="min-w-0 wrap-break-word">{label}</span>
    </span>
  ) : (
    <>{label}</>
  );
