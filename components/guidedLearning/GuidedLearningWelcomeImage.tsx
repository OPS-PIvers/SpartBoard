import React, { useState } from 'react';

interface GuidedLearningWelcomeImageProps {
  url: string;
  /** Blank or absent marks the image decorative. */
  alt?: string;
  className?: string;
}

/** The welcome screen's 16:9 image; hidden if it fails to load. */
export const GuidedLearningWelcomeImage: React.FC<
  GuidedLearningWelcomeImageProps
> = ({ url, alt, className = '' }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl === url) return null;
  return (
    <img
      src={url}
      alt={alt?.trim() ?? ''}
      data-testid="gl-welcome-image"
      draggable={false}
      onError={() => setFailedUrl(url)}
      className={`block aspect-video w-full rounded-xl border border-white/10 object-cover ${className}`}
    />
  );
};
