import React from 'react';
import { WidgetData, BloomsTaxonomyConfig } from '@/types';
import { BloomsQuestionStarters } from './QuestionStarters';

export const BloomsTaxonomyWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as BloomsTaxonomyConfig;

  return (
    <BloomsQuestionStarters
      widgetType={widget.type}
      baseTextSize={widget.baseTextSize}
      cardColor={config.cardColor}
      cardOpacity={config.cardOpacity}
    />
  );
};
