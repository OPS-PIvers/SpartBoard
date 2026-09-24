import React from 'react';
import { HelpCircle, Star } from 'lucide-react';
import type { PlcNormingLevel } from '@/types';
import { NORMING_LEVEL_STARS } from '@/utils/plcNorming';

/** Stars for High/Medium/Low and a question mark for Review; decorative, the label carries the meaning. */
export const NormingLevelSymbol: React.FC<{
  level: PlcNormingLevel;
  className?: string;
}> = ({ level, className = 'w-3.5 h-3.5' }) => {
  const stars = NORMING_LEVEL_STARS[level];
  if (stars === 0)
    return <HelpCircle className={className} aria-hidden="true" />;
  return (
    <span className="inline-flex items-center" aria-hidden="true">
      {Array.from({ length: stars }, (_, i) => (
        <Star key={i} className={`${className} fill-current`} />
      ))}
    </span>
  );
};
