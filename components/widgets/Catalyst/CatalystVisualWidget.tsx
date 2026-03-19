import React from 'react';
import { WidgetData, CatalystVisualConfig } from '@/types';
import * as Icons from 'lucide-react';
import {
  Hand,
  Megaphone,
  Users,
  ListTodo,
  Zap,
  HelpCircle,
} from 'lucide-react';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';

export const CatalystVisualWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as CatalystVisualConfig;

  const getIcon = (iconName: string) => {
    const icons: Record<string, React.ElementType> = {
      Hand: Hand,
      Megaphone: Megaphone,
      Users: Users,
      ListTodo: ListTodo,
      Zap: Zap,
    };
    const Icon =
      icons[iconName] ??
      (Icons as unknown as Record<string, React.ElementType>)[iconName] ??
      HelpCircle;
    return (
      <Icon
        className="animate-pulse"
        style={{ width: '40cqmin', height: '40cqmin' }}
      />
    );
  };

  const colors: Record<string, string> = {
    'Get Attention': 'bg-red-50 text-red-600 border-red-200',
    Engage: 'bg-blue-50 text-blue-600 border-blue-200',
    'Set Up': 'bg-green-50 text-green-600 border-green-200',
    Support: 'bg-purple-50 text-purple-600 border-purple-200',
  };

  const theme =
    colors[config.category ?? ''] ??
    'bg-slate-50 text-slate-600 border-slate-200';
  const title = config.title ?? 'Visual Anchor';

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full flex flex-col items-center justify-center ${theme} border-2 border-double border-current`}
          style={{
            padding: 'min(24px, 5cqmin)',
            gap: '5cqmin',
          }}
        >
          <div className="shrink-0">{getIcon(config.icon ?? '')}</div>
          <h2
            className="font-black text-center uppercase tracking-wider leading-tight w-full"
            style={{ fontSize: '6cqmin' }}
          >
            {title}
          </h2>
        </div>
      }
    />
  );
};

export const CatalystVisualSettings: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  return (
    <div className="p-4 text-center">
      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
        Visual Anchor Mode
      </p>
    </div>
  );
};
