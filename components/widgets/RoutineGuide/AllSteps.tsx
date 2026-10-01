import React from 'react';
import { RoutineGuideStep } from '@/types';
import { getRoutineGuideColor } from '@/config/routineGuide';
import { RoutineIcon } from './RoutineIcon';

export type AllStepsLayout = 'columns' | 'rows' | 'timeline';

// Keeps corner controls clear of DraggableWindow's 24px corner resize handles.
const CORNER_CLEARANCE = 'max(26px, 3cqmin)';

const Badge: React.FC<{ step: RoutineGuideStep; size: string }> = ({
  step,
  size,
}) => {
  const color = getRoutineGuideColor(step.color);
  return step.imageUrl ? (
    <img
      src={step.imageUrl}
      alt=""
      className="shrink-0 object-cover rounded-lg border border-slate-200 bg-white"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: color.tint,
        color: color.ink,
      }}
    >
      <RoutineIcon name={step.icon} style={{ width: '55%', height: '55%' }} />
    </span>
  );
};

const stepProps = (
  i: number,
  index: number | undefined,
  onMove: ((i: number) => void) | undefined
) =>
  onMove
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-current': i === index ? ('step' as const) : undefined,
        onClick: () => onMove(i),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onMove(i);
          }
        },
      }
    : {};

export const AllSteps: React.FC<{
  steps: RoutineGuideStep[];
  layout: AllStepsLayout;
  index?: number;
  onMove?: (i: number) => void;
  renderTool?: (step: RoutineGuideStep) => React.ReactNode;
}> = ({ steps, layout, index, onMove, renderTool }) => {
  const dim = (i: number) => index !== undefined && i !== index;
  const interactive = onMove ? 'cursor-pointer' : '';

  if (layout === 'columns') {
    return (
      <ol
        className="h-full w-full overflow-auto custom-scrollbar grid"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(max(120px, 26cqmin), 1fr))`,
          gap: 'min(10px, 2.5cqmin)',
          padding: `min(14px, 3.5cqmin) ${CORNER_CLEARANCE}`,
        }}
      >
        {steps.map((step, i) => {
          const color = getRoutineGuideColor(step.color);
          return (
            <li
              key={step.id}
              {...stepProps(i, index, onMove)}
              className={`flex flex-col items-center text-center rounded-xl transition-opacity ${interactive} ${
                dim(i) ? 'opacity-45' : ''
              }`}
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(12px, 3cqmin) min(8px, 2cqmin)',
                backgroundColor: color.tint,
              }}
            >
              <span
                className="font-black tabular-nums"
                style={{ fontSize: 'min(28px, 8cqmin)', color: color.ink }}
              >
                {i + 1}
              </span>
              <Badge step={step} size="min(72px, 18cqmin)" />
              {step.label && (
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ fontSize: 'min(13px, 3.75cqmin)', color: color.ink }}
                >
                  {step.label}
                </span>
              )}
              <span
                className="font-semibold text-slate-800 leading-snug"
                style={{ fontSize: 'min(17px, 4.75cqmin)' }}
              >
                {step.text}
              </span>
              {renderTool?.(step)}
            </li>
          );
        })}
      </ol>
    );
  }

  if (layout === 'timeline') {
    return (
      <ol
        className="h-full w-full overflow-y-auto custom-scrollbar"
        style={{ padding: `min(14px, 3.5cqmin) ${CORNER_CLEARANCE}` }}
      >
        {steps.map((step, i) => {
          const color = getRoutineGuideColor(step.color);
          const last = i === steps.length - 1;
          return (
            <li
              key={step.id}
              {...stepProps(i, index, onMove)}
              className={`flex transition-opacity ${interactive} ${
                dim(i) ? 'opacity-45' : ''
              }`}
              style={{ gap: 'min(14px, 3.5cqmin)' }}
            >
              <span className="flex flex-col items-center shrink-0">
                <span
                  className="rounded-full flex items-center justify-center font-black text-white tabular-nums"
                  style={{
                    width: 'min(40px, 11cqmin)',
                    height: 'min(40px, 11cqmin)',
                    fontSize: 'min(18px, 5.5cqmin)',
                    backgroundColor: color.ink,
                  }}
                >
                  {i + 1}
                </span>
                {!last && (
                  <span
                    className="flex-1 bg-slate-300"
                    style={{ width: 'min(3px, 0.75cqmin)' }}
                  />
                )}
              </span>
              <span
                className="flex-1 min-w-0 flex items-start"
                style={{
                  gap: 'min(12px, 3cqmin)',
                  paddingBottom: last ? 0 : 'min(18px, 4.5cqmin)',
                }}
              >
                <span className="flex-1 min-w-0">
                  {step.label && (
                    <span
                      className="block font-black uppercase tracking-wider"
                      style={{
                        fontSize: 'min(13px, 3.75cqmin)',
                        color: color.ink,
                        lineHeight: 'min(40px, 11cqmin)',
                      }}
                    >
                      {step.label}
                    </span>
                  )}
                  <span
                    className="block font-semibold text-slate-800 leading-snug"
                    style={{ fontSize: 'min(18px, 5.25cqmin)' }}
                  >
                    {step.text}
                  </span>
                  {renderTool && (
                    <span
                      className="block"
                      style={{ marginTop: 'min(6px, 1.5cqmin)' }}
                    >
                      {renderTool(step)}
                    </span>
                  )}
                </span>
                <Badge step={step} size="min(56px, 15cqmin)" />
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol
      className="h-full w-full overflow-y-auto custom-scrollbar flex flex-col"
      style={{
        gap: 'min(8px, 2cqmin)',
        padding: `min(12px, 3cqmin) ${CORNER_CLEARANCE}`,
      }}
    >
      {steps.map((step, i) => {
        const color = getRoutineGuideColor(step.color);
        return (
          <li
            key={step.id}
            {...stepProps(i, index, onMove)}
            className={`flex-1 flex items-center rounded-xl transition-opacity ${interactive} ${
              dim(i) ? 'opacity-45' : ''
            }`}
            style={{
              gap: 'min(14px, 3.5cqmin)',
              padding: 'min(10px, 2.5cqmin) min(14px, 3.5cqmin)',
              backgroundColor: color.tint,
              minHeight: 'min(72px, 18cqmin)',
            }}
          >
            <Badge step={step} size="min(56px, 15cqmin)" />
            <span className="flex-1 min-w-0">
              {step.label && (
                <span
                  className="block font-black uppercase tracking-wider"
                  style={{ fontSize: 'min(13px, 3.75cqmin)', color: color.ink }}
                >
                  {step.label}
                </span>
              )}
              <span
                className="block font-semibold text-slate-800 leading-snug"
                style={{ fontSize: 'min(19px, 5.5cqmin)' }}
              >
                {step.text}
              </span>
            </span>
            {renderTool?.(step)}
          </li>
        );
      })}
    </ol>
  );
};
