import React, { useState } from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import * as Icons from 'lucide-react';
import { COMMON_INSTRUCTIONAL_ICONS } from '@/config/instructionalIcons';
import { getRoutineColorClasses } from './colorHelpers';
import { FloatingPanel } from '@/components/common/FloatingPanel';

export const IconPicker: React.FC<{
  currentIcon: string;
  onSelect: (icon: string) => void;
  color?: string;
  anchor?: TourAnchorAttrs;
}> = ({ currentIcon, onSelect, color = 'blue', anchor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const colorClasses = getRoutineColorClasses(color);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-center justify-center ${colorClasses.text} ${colorClasses.bg}`}
        title="Select Icon"
        {...anchor}
      >
        {(Icons as unknown as Record<string, React.ElementType>)[
          currentIcon
        ] ? (
          React.createElement(
            (Icons as unknown as Record<string, React.ElementType>)[
              currentIcon
            ],
            { size: 16 }
          )
        ) : (
          <Icons.HelpCircle size={16} />
        )}
      </button>

      {isOpen && (
        <FloatingPanel className="absolute top-full left-0 mt-2 w-64">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-xxs font-black uppercase text-slate-400">
              Select Icon
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <Icons.X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
            {COMMON_INSTRUCTIONAL_ICONS.map((icon) => {
              const IconComp = (
                Icons as unknown as Record<string, React.ElementType>
              )[icon];
              if (!IconComp) return null;
              return (
                <button
                  key={icon}
                  onClick={() => {
                    onSelect(icon);
                    setIsOpen(false);
                  }}
                  className={`p-2 rounded-lg transition-all hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center ${
                    currentIcon === icon
                      ? 'bg-blue-600 text-white shadow-lg scale-110'
                      : 'text-slate-500'
                  }`}
                >
                  <IconComp size={16} />
                </button>
              );
            })}
          </div>
        </FloatingPanel>
      )}
    </div>
  );
};
