import React from 'react';
import { WidgetData } from '@/types';
import { Speech } from 'lucide-react';

const CentrallyManagedNotice: React.FC = () => (
  <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center flex flex-col items-center gap-3">
    <Speech className="w-6 h-6 text-slate-400" />
    <p className="text-sm text-slate-600 leading-relaxed">
      This widget is centrally managed. Your district administrator configures
      the embedded URL for all classrooms.
    </p>
  </div>
);

export const BlendingBoardSettings: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  return <CentrallyManagedNotice />;
};

// Suppress the default UniversalStyleSettings fallback in the Style tab —
// Blending Board has no per-widget styling because the iframe is opaque
// and the URL is admin-controlled. Show the same read-only notice.
export const BlendingBoardAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget: _widget }) => {
  return <CentrallyManagedNotice />;
};
