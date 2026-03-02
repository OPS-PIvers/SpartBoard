import React from 'react';
import { WidgetData, StickerConfig } from '@/types';
import { DraggableSticker } from './DraggableSticker';
import * as Icons from 'lucide-react';

interface StickerItemWidgetProps {
  widget: WidgetData;
}

export const StickerItemWidget: React.FC<StickerItemWidgetProps> = ({
  widget,
}) => {
  const config = widget.config as StickerConfig;

  // Helper for dynamic classes since Tailwind might purge unused dynamic strings
  const getColorClasses = (color: string) => {
    const colors: Record<
      string,
      { border: string; bg: string; text: string; shadow: string }
    > = {
      amber: {
        border: 'border-amber-200',
        bg: 'bg-amber-50',
        text: 'text-amber-600',
        shadow: 'shadow-amber-500/20',
      },
      blue: {
        border: 'border-blue-200',
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        shadow: 'shadow-blue-500/20',
      },
      indigo: {
        border: 'border-indigo-200',
        bg: 'bg-indigo-50',
        text: 'text-indigo-600',
        shadow: 'shadow-indigo-500/20',
      },
      green: {
        border: 'border-green-200',
        bg: 'bg-green-50',
        text: 'text-green-600',
        shadow: 'shadow-green-500/20',
      },
      slate: {
        border: 'border-slate-200',
        bg: 'bg-slate-50',
        text: 'text-slate-600',
        shadow: 'shadow-slate-500/20',
      },
      purple: {
        border: 'border-purple-200',
        bg: 'bg-purple-50',
        text: 'text-purple-600',
        shadow: 'shadow-purple-500/20',
      },
    };
    return colors[color] ?? colors.blue;
  };

  // Catalyst-style stickers (with icons and labels in a white card)
  if (config.icon) {
    const IconComponent =
      (Icons as unknown as Record<string, React.ElementType>)[config.icon] ??
      Icons.HelpCircle;
    const theme = getColorClasses(config.color ?? 'blue');

    return (
      <DraggableSticker widget={widget}>
        <div
          className={`w-full h-full flex flex-col items-center justify-center rounded-3xl border-[6px] ${theme.border} bg-white ${theme.shadow} shadow-2xl relative p-2`}
        >
          {/* Icon Container */}
          <div
            className={`rounded-2xl ${theme.bg} ${theme.text} w-full flex-1 flex items-center justify-center transition-all overflow-hidden`}
          >
            <IconComponent className="w-[70%] h-[70%]" strokeWidth={2.5} />
          </div>

          {/* Label Area (Outside the icon bg, but inside the white card) */}
          {config.label && (
            <div className="w-full pt-1.5 pb-0.5 text-center">
              <span
                className={`text-xxs font-black uppercase tracking-wider ${theme.text} block truncate px-1`}
              >
                {config.label}
              </span>
            </div>
          )}
        </div>
      </DraggableSticker>
    );
  }

  // Floating image stickers (no background or container)
  return (
    <DraggableSticker widget={widget}>
      <div className="w-full h-full flex items-center justify-center group/img">
        {config.url ? (
          <img
            src={config.url}
            alt="Sticker"
            className="max-w-full max-h-full object-contain pointer-events-none drop-shadow-lg transition-transform group-hover/img:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-pink-100/50 rounded-lg border-2 border-dashed border-pink-300">
            <span className="text-xs text-pink-500 font-bold">No Image</span>
          </div>
        )}
      </div>
    </DraggableSticker>
  );
};
