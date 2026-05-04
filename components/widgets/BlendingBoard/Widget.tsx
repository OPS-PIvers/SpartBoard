import React from 'react';
import { WidgetData } from '@/types';
import { Speech, ExternalLink, Loader2 } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useBlendingBoardConfig } from '@/components/widgets/BlendingBoard/hooks/useBlendingBoardConfig';

export const BlendingBoardWidget: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  const { url, isLoading } = useBlendingBoardConfig();

  if (isLoading) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="w-full h-full flex items-center justify-center bg-slate-50">
            <Loader2
              className="animate-spin text-slate-300"
              style={{
                width: 'min(32px, 8cqmin)',
                height: 'min(32px, 8cqmin)',
              }}
            />
          </div>
        }
      />
    );
  }

  const isValidUrl = url.startsWith('https://');

  if (!url || !isValidUrl) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Speech}
            title="Blending Board Disabled"
            subtitle={
              !url
                ? 'Your district administrator has not configured the embed URL yet.'
                : 'The configured embed URL is invalid or insecure.'
            }
          />
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="w-full h-full relative group/blending-content">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute z-10 bg-white/80 backdrop-blur-sm hover:bg-white text-slate-500 hover:text-violet-500 shadow-sm border border-slate-200/50 transition-colors"
            style={{
              top: 'min(8px, 2cqmin)',
              right: 'min(8px, 2cqmin)',
              padding: 'min(6px, 1.5cqmin)',
              borderRadius: 'min(8px, 2cqmin)',
            }}
            title="Open in new tab"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ExternalLink
              style={{
                width: 'min(12px, 2.5cqmin)',
                height: 'min(12px, 2.5cqmin)',
              }}
            />
          </a>
          <iframe
            title="Blending Board"
            src={url}
            className="w-full h-full border-none"
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          />
        </div>
      }
    />
  );
};
