import React from 'react';

/** A card side's picture, above its text. */
export const CardPicture: React.FC<{ url: string | undefined }> = ({ url }) =>
  url ? (
    <img
      src={url}
      alt=""
      className="block rounded-[min(14px,3cqmin)] object-contain"
      style={{
        maxWidth: '100%',
        maxHeight: 'min(320px, 42cqmin)',
        marginBottom: 'min(16px, 3.5cqmin)',
      }}
    />
  ) : null;
