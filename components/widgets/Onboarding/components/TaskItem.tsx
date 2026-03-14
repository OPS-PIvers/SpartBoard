import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { OnboardingTask } from '../types';

interface TaskItemProps {
  task: OnboardingTask;
  done: boolean;
  markDone: (taskId: string) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, done, markDone }) => {
  return (
    <button
      onClick={() => markDone(task.id)}
      className={`w-full text-left rounded-lg border transition-all ${
        done
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-white/5 border-white/10 hover:bg-white/10'
      }`}
      style={{ padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)' }}
    >
      <div className="flex items-start" style={{ gap: 'min(8px, 2cqmin)' }}>
        {done ? (
          <CheckCircle2
            className="text-green-400 shrink-0"
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
              marginTop: 'min(1px, 0.3cqmin)',
            }}
          />
        ) : (
          <Circle
            className="text-slate-400 shrink-0"
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
              marginTop: 'min(1px, 0.3cqmin)',
            }}
          />
        )}
        <div className="flex flex-col" style={{ gap: 'min(2px, 0.5cqmin)' }}>
          <span
            className={`font-semibold ${done ? 'line-through text-slate-400' : 'text-white'}`}
            style={{ fontSize: 'min(12px, 3.5cqmin)' }}
          >
            {task.label}
          </span>
          {!done && (
            <span
              className="text-slate-400 leading-snug"
              style={{ fontSize: 'min(10px, 2.8cqmin)' }}
            >
              {task.hint}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};
