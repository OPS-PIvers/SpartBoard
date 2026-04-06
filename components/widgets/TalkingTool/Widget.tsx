import React, { useState } from 'react';
import { Quote } from 'lucide-react';
import {
  WidgetComponentProps,
  TalkingToolGlobalConfig,
  TalkingToolConfig,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { DEFAULT_TALKING_TOOL_CATEGORIES } from '@/config/talkingToolData';
import { getIcon } from './constants';
import { hexToRgba } from '@/utils/styles';

export const TalkingToolWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { featurePermissions } = useAuth();
  const widgetConfig = widget.config as TalkingToolConfig;
  const cardColor = widgetConfig.cardColor ?? '#ffffff';
  const cardOpacity = widgetConfig.cardOpacity ?? 1;
  const surfaceBg = hexToRgba(cardColor, cardOpacity);

  // Get config from feature permissions
  const permission = featurePermissions.find(
    (p) => p.widgetType === 'talking-tool'
  );

  const config = permission?.config as
    | Partial<TalkingToolGlobalConfig>
    | undefined;

  const categories = config?.categories?.length
    ? config.categories
    : DEFAULT_TALKING_TOOL_CATEGORIES;

  const [activeTab, setActiveTab] = useState<string>(categories[0]?.id ?? '');

  const activeCat = categories.find((c) => c.id === activeTab) ?? categories[0];

  if (!activeCat) return null;

  return (
    <div
      className="flex h-full w-full select-none overflow-hidden rounded-lg"
      style={{ backgroundColor: surfaceBg }}
    >
      {/* Sidebar Navigation */}
      <div
        className="flex flex-col border-r border-slate-200 shrink-0"
        style={{ width: 'min(140px, 35cqw)', backgroundColor: surfaceBg }}
      >
        <div
          className="border-b border-slate-200"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <label
            className="font-black uppercase text-slate-400 tracking-widest block"
            style={{
              fontSize: 'min(9px, 2.2cqmin)',
              marginBottom: 'min(4px, 1cqmin)',
            }}
          >
            Scaffolding
          </label>
          <div
            className="flex items-center text-slate-700 font-bold uppercase tracking-tight"
            style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(12px, 3cqmin)' }}
          >
            <Quote
              className="text-slate-400"
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
            Stems
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar"
          style={{ padding: 'min(8px, 2cqmin)' }}
        >
          {categories.map((cat) => {
            const isActive = activeTab === cat.id;
            const Icon = getIcon(cat.icon);

            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`w-full flex flex-col items-center justify-center transition-all border ${
                  isActive
                    ? 'shadow-md text-white scale-100'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 scale-95'
                }`}
                style={{
                  padding: 'min(12px, 3cqmin)',
                  borderRadius: 'min(12px, 3cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                  ...(isActive
                    ? { backgroundColor: cat.color, borderColor: cat.color }
                    : {
                        borderBottomColor: cat.color,
                        borderBottomWidth: '3px',
                      }),
                }}
              >
                <Icon
                  className="mb-2"
                  style={{
                    width: 'min(22px, 5.5cqmin)',
                    height: 'min(22px, 5.5cqmin)',
                    color: isActive ? '#ffffff' : cat.color,
                  }}
                />
                <span
                  className="font-bold text-center leading-tight uppercase tracking-tight"
                  style={{ fontSize: 'min(11px, 2.8cqmin)' }}
                >
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(20px, 5cqmin)', backgroundColor: surfaceBg }}
      >
        <div className="animate-in fade-in slide-in-from-right-2 duration-300">
          <h3
            className="font-black mb-4 uppercase tracking-tight flex items-center"
            style={{
              color: activeCat.color,
              fontSize: 'min(18px, 4.5cqmin)',
              gap: 'min(8px, 2cqmin)',
              marginBottom: 'min(16px, 4cqmin)',
            }}
          >
            {React.createElement(getIcon(activeCat.icon), {
              style: {
                width: 'min(20px, 5cqmin)',
                height: 'min(20px, 5cqmin)',
              },
            })}
            {activeCat.label}
          </h3>
          <ul className="flex flex-col" style={{ gap: 'min(12px, 3cqmin)' }}>
            {activeCat.stems.map((stem) => (
              <li
                key={stem.id}
                className="font-medium text-slate-700 border-l-4 leading-relaxed shadow-sm bg-slate-50 rounded-r-lg"
                style={{
                  borderLeftColor: activeCat.color,
                  fontSize: 'min(14px, 3.5cqmin)',
                  paddingLeft: 'min(16px, 4cqmin)',
                  paddingTop: 'min(8px, 2cqmin)',
                  paddingBottom: 'min(8px, 2cqmin)',
                }}
              >
                {stem.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
