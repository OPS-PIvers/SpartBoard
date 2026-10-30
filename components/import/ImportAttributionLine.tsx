import React from 'react';
import type { ImportAttribution } from '@/utils/import/contract';
import { GENERIC_PLATFORM } from '@/utils/import/contract';

const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  schoology: 'Schoology',
  'google-forms': 'Google Forms',
  quizlet: 'Quizlet',
  edpuzzle: 'Edpuzzle',
  youtube: 'YouTube',
};

const safeUrl = (url: string): URL | null => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
};

/** "Imported from Quizlet · <title>", linked to the Source; teacher views only (D7). */
export const ImportAttributionLine: React.FC<{
  attribution: ImportAttribution;
  className?: string;
  style?: React.CSSProperties;
}> = ({ attribution, className, style }) => {
  const url = safeUrl(attribution.sourceUrl);
  const site =
    (attribution.platform && attribution.platform !== GENERIC_PLATFORM
      ? PLATFORM_NAMES[attribution.platform]
      : undefined) ?? url?.hostname.replace(/^www\./, '');
  if (!site) return null;
  const title = attribution.sourceTitle.trim();
  const text = `Imported from ${site}${title ? ` · ${title}` : ''}`;
  return (
    <p className={`truncate ${className ?? ''}`} style={style} title={text}>
      {url ? (
        <a
          href={url.toString()}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {text}
        </a>
      ) : (
        text
      )}
    </p>
  );
};
