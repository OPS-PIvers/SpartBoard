// The rubric card Claude shows after a rubric tool: the grid plus a box to ask for changes.
import React, { useState } from 'react';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { MAX_ASK, criterionMessage, wholeRubricMessage } from './messages';
import type { CardActions } from './cardActions';
import { RubricTable } from './RubricTable';
import type { RubricView } from './types';

export const RubricCard: React.FC<{
  view: RubricView;
  actions: CardActions;
  openUrl: string;
  superseded: boolean;
}> = ({ view, actions, openUrl, superseded }) => {
  const [target, setTarget] = useState('all');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');

  const send = () => {
    const ask = text.trim();
    if (!ask) return;
    const criterion = view.criteria[Number(target)];
    setStatus('Sending…');
    void actions
      .ask(
        criterion
          ? criterionMessage(view, criterion, ask)
          : wholeRubricMessage(view, ask)
      )
      .then((ok) => {
        setStatus(ok ? 'Sent to Claude.' : 'Not sent.');
        if (ok) setText('');
      });
  };

  return (
    <div className="bg-white font-sans">
      <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-white">
        <ClipboardList
          className="h-4 w-4 shrink-0 text-slate-300"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {view.title}
        </span>
        <span className="shrink-0 text-xs text-slate-300">
          {view.criteria.length}{' '}
          {view.criteria.length === 1 ? 'criterion' : 'criteria'} ·{' '}
          {view.max_points} pts
        </span>
        {/* no-tour-anchor: inside Claude */}
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-200 transition-colors hover:bg-white/10"
          onClick={() => actions.open(openUrl)}
          title="Open SpartBoard"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Open SpartBoard</span>
        </button>
      </div>
      {superseded && (
        <p className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">
          A newer version is below.
        </p>
      )}
      <div className="space-y-3 p-4">
        {view.description && (
          <p className="text-sm text-slate-600">{view.description}</p>
        )}
        <RubricTable rubric={view} />
        <div className="flex flex-wrap gap-2">
          {/* no-tour-anchor: inside Claude */}
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="What to change"
            disabled={superseded}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-bold text-slate-700"
          >
            <option value="all">Whole rubric</option>
            {view.criteria.map((c, i) => (
              <option key={`${c.name}-${i}`} value={String(i)}>
                {c.name}
              </option>
            ))}
          </select>
          {/* no-tour-anchor: inside Claude */}
          <input
            type="text"
            value={text}
            maxLength={MAX_ASK}
            disabled={superseded}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="For example: use four levels"
            aria-label="What should change"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/20"
          />
          {/* no-tour-anchor: inside Claude */}
          <button
            type="button"
            onClick={send}
            disabled={superseded || !text.trim()}
            className="rounded-lg bg-brand-blue-dark px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-blue-primary disabled:opacity-40"
          >
            Send
          </button>
        </div>
        {status && (
          <p role="status" className="text-xs text-slate-500">
            {status}
          </p>
        )}
      </div>
    </div>
  );
};
