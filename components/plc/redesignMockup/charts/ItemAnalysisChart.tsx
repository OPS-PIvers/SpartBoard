// Item analysis from buildItemAnalysis: percent correct, the most common wrong answer, the rest.

import React from 'react';
import type { ItemAnalysisQuestion } from '@/utils/plcDataOverview';
import { BarRows } from './BarRows';
import { ChartLegend } from './ChartTooltip';
import { ITEM_LEGEND, itemAnalysisRows } from './itemAnalysisRows';

export const ItemAnalysisLegend: React.FC = () => (
  <ChartLegend items={ITEM_LEGEND} />
);

export const ItemAnalysisChart: React.FC<{
  questions: ItemAnalysisQuestion[];
  flagReteach?: boolean;
  breakAfterReteach?: boolean;
  targetOf?: Record<string, string>;
  compact?: boolean;
}> = ({
  questions,
  flagReteach = true,
  breakAfterReteach = true,
  targetOf,
  compact = false,
}) => (
  <BarRows
    rows={itemAnalysisRows(questions, {
      flagReteach,
      breakAfterReteach,
      targetOf,
    })}
    columns={
      compact
        ? 'grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,14rem)]'
        : 'grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,15rem)]'
    }
  />
);
