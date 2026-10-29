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
import { tourFieldAttr } from '@/config/tourAnchors';
import { resolveBaseTextScale } from '@/config/widgetAppearance';

export const TalkingToolWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { featurePermissions } = useAuth();
  const widgetConfig = widget.config as TalkingToolConfig;
  const cardColor = widgetConfig.cardColor ?? '#ffffff';
  const cardOpacity = widgetConfig.cardOpacity ?? 1;
  const surfaceBg = hexToRgba(cardColor, cardOpacity);
  // Window text size scales the stems; the sidebar only grows with the widget.
  const textScale = resolveBaseTextScale(widget.baseTextSize);

  // Get config from feature permissions
  const permission = featurePermissions.find(
    (p) => p.widgetType === 'talking-tool'
  );

  const config = permission?.config as
    Partial<TalkingToolGlobalConfig> | undefined;

  const categories = config?.categories?.length
    ? config.categories
    : DEFAULT_TALKING_TOOL_CATEGORIES;

  const [activeTab, setActiveTab] = useState<string>(categories[0]?.id ?? '');
  // Resync activeTab during render if the admin-configured category set changed underneath it
  const categoryKey = categories.map((c) => c.id).join('|');
  const [lastCategoryKey, setLastCategoryKey] = useState(categoryKey);
  if (categoryKey !== lastCategoryKey) {
    setLastCategoryKey(categoryKey);
    if (!categories.some((c) => c.id === activeTab)) {
      setActiveTab(categories[0]?.id ?? '');
    }
  }

  const activeCat = categories.find((c) => c.id === activeTab) ?? categories[0];

  if (!activeCat) return null;

  return (
    <div
      className="flex h-full w-full select-none overflow-hidden rounded-[var(--window-radius,0px)]"
      style={{ backgroundColor: surfaceBg }}
    >
      {/* Sidebar Navigation */}
      <div
        className="flex flex-col border-r border-slate-200 shrink-0"
        style={{
          width: 'min(max(140px, 35cqmin), 35cqw)',
          backgroundColor: surfaceBg,
        }}
      >
        <div
          className="border-b border-slate-200"
          style={{ padding: '3cqmin' }}
        >
          <label
            className="font-black uppercase text-slate-400 tracking-widest leading-normal block"
            style={{
              fontSize: '2.2cqmin',
              marginBottom: '1cqmin',
            }}
          >
            Scaffolding
          </label>
          <div
            className="flex items-center text-slate-700 font-bold uppercase tracking-tight leading-normal"
            style={{ gap: '1.5cqmin', fontSize: '3cqmin' }}
          >
            <Quote
              className="text-slate-400"
              style={{
                width: '3.5cqmin',
                height: '3.5cqmin',
              }}
            />
            Stems
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: '2cqmin' }}
        >
          {categories.map((cat) => {
            const isActive = activeTab === cat.id;
            const Icon = getIcon(cat.icon);

            return (
              <button
                key={cat.id}
                aria-pressed={isActive}
                {...tourFieldAttr('talking-tool.category', widget.type, cat.id)}
                onClick={() => setActiveTab(cat.id)}
                className={`w-full flex flex-col items-center justify-center transition-all border ${
                  isActive
                    ? 'shadow-md text-white scale-100'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 scale-95'
                }`}
                style={{
                  padding: '3cqmin',
                  borderRadius: '3cqmin',
                  marginBottom: '2cqmin',
                  ...(isActive
                    ? { backgroundColor: cat.color, borderColor: cat.color }
                    : {
                        borderBottomColor: cat.color,
                        borderBottomWidth: '3px',
                      }),
                }}
              >
                <Icon
                  style={{
                    width: '5.5cqmin',
                    height: '5.5cqmin',
                    color: isActive ? '#ffffff' : cat.color,
                    marginBottom: '2cqmin',
                  }}
                />
                <span
                  className="font-bold text-center leading-tight uppercase tracking-tight"
                  style={{ fontSize: '2.8cqmin' }}
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
        style={{
          padding: '5cqmin',
          backgroundColor: surfaceBg,
          fontSize: `${3.5 * textScale}cqmin`,
        }}
      >
        <div className="animate-in fade-in slide-in-from-right-2 duration-300">
          <h3
            className="font-black uppercase tracking-tight leading-normal flex items-center"
            style={{
              color: activeCat.color,
              fontSize: '1.29em',
              gap: '0.44em',
              marginBottom: '0.89em',
            }}
          >
            {React.createElement(getIcon(activeCat.icon), {
              style: {
                width: '1.11em',
                height: '1.11em',
              },
            })}
            {activeCat.label}
          </h3>
          <ul className="flex flex-col" style={{ gap: '0.85em' }}>
            {activeCat.stems.map((stem) => (
              <li
                key={stem.id}
                className="font-medium text-slate-700 border-l-4 leading-relaxed shadow-sm bg-slate-50 rounded-r-lg"
                style={{
                  borderLeftColor: activeCat.color,
                  paddingLeft: '1.14em',
                  paddingTop: '0.57em',
                  paddingBottom: '0.57em',
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
