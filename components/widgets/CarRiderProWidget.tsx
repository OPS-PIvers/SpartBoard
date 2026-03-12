import React, { useEffect, useState } from 'react';
import { WidgetData, CarRiderProGlobalConfig } from '@/types';
import { CarFront, ExternalLink, Loader2 } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';

export const CarRiderProWidget: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'feature_permissions', 'car-rider-pro'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as {
            config?: CarRiderProGlobalConfig;
            url?: string;
          };
          // Prefer config.url (new shape); fall back to top-level url (legacy shape)
          const resolved = data.config?.url ?? data.url ?? '';
          setUrl(resolved);
        } else {
          setUrl('');
        }
        setIsLoading(false);
      },
      (error) => {
        console.error(
          'Failed to listen for Car Rider Pro config changes:',
          error
        );
        setIsLoading(false);
        setUrl('');
      }
    );
    return () => unsubscribe();
  }, []);

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

  const isValidUrl = url?.startsWith('https://');

  if (!url || !isValidUrl) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={CarFront}
            title="Car Rider Pro Disabled"
            subtitle={
              !url
                ? 'Your district administrator has not configured the global login link yet.'
                : 'The configured login link is invalid or insecure.'
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
        <div className="w-full h-full relative group/crp-content">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 z-10 bg-white/80 backdrop-blur-sm hover:bg-white text-slate-500 hover:text-blue-500 shadow-sm border border-slate-200/50 rounded-lg p-1.5 transition-colors"
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
            title="Car Rider Pro"
            src={url}
            className="w-full h-full border-none"
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          />
        </div>
      }
    />
  );
};

export const CarRiderProSettings: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center flex flex-col items-center gap-3">
      <CarFront className="w-6 h-6 text-slate-400" />
      <p className="text-sm text-slate-600 leading-relaxed">
        This widget is centrally managed. Your district administrator configures
        the login URL for all classrooms.
      </p>
    </div>
  );
};
