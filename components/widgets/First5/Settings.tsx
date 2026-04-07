import React from 'react';
import { WidgetData } from '@/types';
import { First5Icon } from './First5Icon';
import { useFirst5Url } from './hooks/useFirst5Url';

export const First5Settings: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  const { url } = useFirst5Url();

  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center flex flex-col items-center gap-3">
      <First5Icon className="w-6 h-6 text-slate-400" />
      <p className="text-sm text-slate-600 leading-relaxed">
        This widget automatically shows today&apos;s First 5 content based on
        your selected building. The content updates each weekday at 6:00 AM.
      </p>
      {url && (
        <p className="text-xs text-slate-400 break-all">Current URL: {url}</p>
      )}
    </div>
  );
};
