import React from 'react';
import { WidgetData } from '@/types';
import { CarFront } from 'lucide-react';

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
