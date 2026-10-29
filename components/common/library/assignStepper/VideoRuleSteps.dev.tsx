// DEV-only preview of the Video Activity rule step bodies in a stand-in step frame.
/* eslint-disable react-refresh/only-export-components -- the harness reads a default { title, render } export */
import React, { useState } from 'react';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import { videoRuleStepDefs } from './videoRuleStepDefs';
import { videoRulesFromBehavior } from './VideoRuleStepValues';

const Frame: React.FC<{
  n: number;
  title: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}> = ({ n, title, value, open, onOpen, children }) => (
  <div
    className={`rounded-xl border bg-white ${open ? 'border-brand-blue-primary/40 shadow-sm' : 'border-slate-200'}`}
  >
    {/* no-tour-anchor: DEV-only harness frame, never shipped */}
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${open ? 'border-2 border-brand-blue-primary bg-white text-brand-blue-primary' : 'bg-slate-100 text-slate-500'}`}
      >
        {n}
      </span>
      <span
        className={`text-sm font-bold ${open ? 'text-brand-blue-dark' : 'text-slate-700'}`}
      >
        {title}
      </span>
      {!open && (
        <span className="ml-auto min-w-0 truncate pl-4 text-xs text-slate-500">
          {value}
        </span>
      )}
    </button>
    {open && <div className="px-4 pb-4 pl-[3.25rem]">{children}</div>}
  </div>
);

const Preview: React.FC<{ answerRows?: boolean }> = ({ answerRows }) => {
  const [value, setValue] = useState(() =>
    videoRulesFromBehavior(structuredClone(DEFAULT_VA_BEHAVIOR))
  );
  const [open, setOpen] = useState(3);
  const defs = videoRuleStepDefs({ value, onChange: setValue, answerRows });
  return (
    <div className="mx-auto max-w-xl space-y-1.5">
      {defs.map((def, i) => (
        <Frame
          key={def.id}
          n={i + 3}
          open={open === i + 3}
          onOpen={() => setOpen(i + 3)}
          title={def.title}
          value={def.value}
        >
          {def.body}
        </Frame>
      ))}
    </div>
  );
};

export default {
  title: 'Video Activity rule steps',
  render: () => (
    <div className="space-y-8">
      <Preview />
      <p className="mx-auto max-w-xl text-xs text-slate-500">
        After the player honors shuffle and answer feedback:
      </p>
      <Preview answerRows />
    </div>
  ),
};
