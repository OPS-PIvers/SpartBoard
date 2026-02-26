import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { WidgetComponentProps, SentenceStemsConfig } from '@/types';
import { WidgetLayout } from './WidgetLayout';
import { useDashboard } from '@/context/useDashboard';

interface StemCategory {
  category: string;
  stems: string[];
}

const STEM_DATA: StemCategory[] = [
  {
    category: 'Agreeing',
    stems: [
      'I agree with ___ because...',
      "I'd like to build on that...",
      'That makes sense because...',
    ],
  },
  {
    category: 'Disagreeing',
    stems: [
      'I see it differently because...',
      'I respectfully disagree because...',
      'Another way to look at it is...',
    ],
  },
  {
    category: 'Clarifying',
    stems: [
      'Can you explain what you mean by...?',
      'So, are you saying that...?',
      'Could you give an example?',
    ],
  },
];

export const SentenceStemsWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as SentenceStemsConfig;
  const expandedIndex = config.expandedIndex ?? 0;

  const toggleCategory = (index: number) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        expandedIndex: expandedIndex === index ? null : index,
      },
    });
  };

  return (
    <WidgetLayout
      content={
        <div className="flex flex-col h-full bg-white overflow-y-auto custom-scrollbar">
          <div
            className="flex flex-col gap-2"
            style={{ padding: 'min(12px, 3cqmin)' }}
          >
            {STEM_DATA.map((item, idx) => {
              const isExpanded = expandedIndex === idx;
              return (
                <div
                  key={idx}
                  className="border rounded-lg border-slate-200 overflow-hidden"
                >
                  <button
                    onClick={() => toggleCategory(idx)}
                    className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                    style={{ padding: 'min(12px, 3cqmin)' }}
                  >
                    <span
                      className="font-bold text-slate-700"
                      style={{ fontSize: 'min(14px, 3.5cqmin)' }}
                    >
                      {item.category}
                    </span>
                    {isExpanded ? (
                      <ChevronUp
                        style={{
                          width: 'min(18px, 4.5cqmin)',
                          height: 'min(18px, 4.5cqmin)',
                        }}
                      />
                    ) : (
                      <ChevronDown
                        style={{
                          width: 'min(18px, 4.5cqmin)',
                          height: 'min(18px, 4.5cqmin)',
                        }}
                      />
                    )}
                  </button>

                  {isExpanded && (
                    <div
                      className="bg-white animate-in fade-in slide-in-from-top-1 duration-200"
                      style={{ padding: 'min(12px, 3cqmin)' }}
                    >
                      <ul
                        className="flex flex-col"
                        style={{ gap: 'min(8px, 2cqmin)' }}
                      >
                        {item.stems.map((stem, sIdx) => (
                          <li
                            key={sIdx}
                            className="text-slate-600 border-l-2 border-blue-400 italic"
                            style={{
                              fontSize: 'min(13px, 3.2cqmin)',
                              paddingLeft: 'min(12px, 3cqmin)',
                              paddingTop: 'min(4px, 1cqmin)',
                              paddingBottom: 'min(4px, 1cqmin)',
                            }}
                          >
                            {`"${stem}"`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      }
    />
  );
};
