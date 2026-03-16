import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, TrafficConfig } from '@/types';

import { WidgetLayout } from '../WidgetLayout';

export const TrafficLightWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as TrafficConfig;

  const current = config.active ?? 'none';

  const toggle = (light: 'red' | 'yellow' | 'green') => {
    updateWidget(widget.id, {
      config: {
        ...config,
        active: current === light ? 'none' : light,
      } as TrafficConfig,
    });
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex items-center justify-center h-full w-full p-[min(4px,1cqmin)]">
          <div className="bg-slate-900 rounded-[2.5rem] shadow-inner flex flex-col items-center border-2 border-slate-700 p-[min(12px,3cqh)] gap-[min(12px,3cqh)] h-[95%] w-[95%] justify-center">
            <button
              onClick={() => {
                toggle('red');
              }}
              className={`rounded-full border-4 border-black/20 traffic-light light-red ${current === 'red' ? 'active bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'bg-red-950/50'}`}
              style={{
                width: 'min(28cqh, 80cqw)',
                height: 'min(28cqh, 80cqw)',
                minWidth: '40px',
                minHeight: '40px',
              }}
            />
            <button
              onClick={() => {
                toggle('yellow');
              }}
              className={`rounded-full border-4 border-black/20 traffic-light light-yellow ${current === 'yellow' ? 'active bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'bg-yellow-950/50'}`}
              style={{
                width: 'min(28cqh, 80cqw)',
                height: 'min(28cqh, 80cqw)',
                minWidth: '40px',
                minHeight: '40px',
              }}
            />
            <button
              onClick={() => {
                toggle('green');
              }}
              className={`rounded-full border-4 border-black/20 traffic-light light-green ${current === 'green' ? 'active bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'bg-green-950/50'}`}
              style={{
                width: 'min(28cqh, 80cqw)',
                height: 'min(28cqh, 80cqw)',
                minWidth: '40px',
                minHeight: '40px',
              }}
            />
          </div>
        </div>
      }
    />
  );
};
