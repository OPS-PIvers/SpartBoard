import React from 'react';
import { ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { WidgetComponentProps, SentenceStemsConfig } from '@/types';
import { WidgetLayout } from './WidgetLayout';
import { useDashboard } from '@/context/useDashboard';

interface Category {
  id: string;
  label: string;
  color: string;
  stems: string[];
}

const CATEGORIES: Category[] = [
  {
    id: 'listen',
    label: 'Listen Closely',
    color: 'bg-blue-500',
    stems: [
      'What do you mean by ________?',
      'Can you tell me more about ________?',
      'What evidence supports your idea?',
      'How does your idea relate to ________?',
    ],
  },
  {
    id: 'share',
    label: 'Share What You Think',
    color: 'bg-green-500',
    stems: [
      'I think ________ because ________.',
      'First, ________. Also, ________. Finally, ________.',
      'I agree and I will add that ________.',
      'I disagree because ________.',
      'I hear you say that ________. This makes me think that ________.',
      'I hear you say that ________. However, ________.',
    ],
  },
  {
    id: 'support',
    label: 'Support What You Say',
    color: 'bg-orange-500',
    stems: [
      'In the text, ________.',
      'For example, ________.',
      'One reason is ________. Another reason is ________.',
      'This evidence shows ________.',
      'This evidence means ________.',
      'This evidence is important because ________.',
    ],
  },
];

export const SentenceStemsWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as SentenceStemsConfig;
  const expandedIndex = config.expandedIndex; // 0, 1, 2 or null

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
      header={
        <div
          className="border-b border-slate-100 bg-slate-50/50"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <label
            className="font-black uppercase text-slate-400 tracking-widest block"
            style={{ fontSize: 'min(10px, 2.5cqmin)' }}
          >
            Academic Scaffolding
          </label>
          <h2
            className="font-bold text-slate-700 flex items-center gap-2"
            style={{ fontSize: 'min(14px, 3.5cqmin)' }}
          >
            <Quote
              className="text-blue-500"
              style={{
                width: 'min(16px, 4cqmin)',
                height: 'min(16px, 4cqmin)',
              }}
            />
            Discussion Stems
          </h2>
        </div>
      }
      content={
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: 'min(8px, 2cqmin)' }}
        >
          <div className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
            {CATEGORIES.map((cat, idx) => {
              const isExpanded = expandedIndex === idx;
              return (
                <div
                  key={cat.id}
                  className="border border-slate-100 rounded-xl overflow-hidden shadow-sm"
                >
                  <button
                    onClick={() => toggleCategory(idx)}
                    className="w-full flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
                    style={{ padding: 'min(12px, 3cqmin)' }}
                  >
                    <div
                      className="flex items-center"
                      style={{ gap: 'min(12px, 3cqmin)' }}
                    >
                      <div
                        className={`rounded-full ${cat.color}`}
                        style={{
                          width: 'min(6px, 1.5cqmin)',
                          height: 'min(20px, 5cqmin)',
                        }}
                      />
                      <span
                        className="font-bold text-slate-600 uppercase tracking-tight"
                        style={{ fontSize: 'min(12px, 3cqmin)' }}
                      >
                        {cat.label}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp
                        className="text-slate-400"
                        style={{
                          width: 'min(16px, 4cqmin)',
                          height: 'min(16px, 4cqmin)',
                        }}
                      />
                    ) : (
                      <ChevronDown
                        className="text-slate-400"
                        style={{
                          width: 'min(16px, 4cqmin)',
                          height: 'min(16px, 4cqmin)',
                        }}
                      />
                    )}
                  </button>

                  {isExpanded && (
                    <div
                      className="bg-slate-50 animate-in fade-in slide-in-from-top-1 duration-200"
                      style={{
                        paddingLeft: 'min(16px, 4cqmin)',
                        paddingRight: 'min(16px, 4cqmin)',
                        paddingBottom: 'min(16px, 4cqmin)',
                        paddingTop: 'min(4px, 1cqmin)',
                      }}
                    >
                      <ul
                        className="flex flex-col"
                        style={{ gap: 'min(12px, 3cqmin)' }}
                      >
                        {cat.stems.map((stem, i) => (
                          <li
                            key={i}
                            className="font-medium text-slate-600 border-l-2 border-slate-200 leading-relaxed"
                            style={{
                              fontSize: 'min(13px, 3.2cqmin)',
                              paddingLeft: 'min(12px, 3cqmin)',
                              paddingTop: 'min(2px, 0.5cqmin)',
                              paddingBottom: 'min(2px, 0.5cqmin)',
                            }}
                          >
                            {stem}
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
