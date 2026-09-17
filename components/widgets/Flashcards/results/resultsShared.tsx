import React from 'react';

export const SectionEmpty: React.FC<{ message: string }> = ({ message }) => (
  <p
    className="text-slate-500"
    style={{
      fontSize: 'min(12px, 3.4cqmin)',
      padding: 'min(14px, 3cqmin)',
    }}
  >
    {message}
  </p>
);

export const ResultsSection: React.FC<{
  title: string;
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, count, actions, children }) => (
  <section className="rounded-2xl border border-slate-200/70 bg-white/70">
    <header
      className="flex items-center justify-between border-b border-slate-200/70"
      style={{ padding: 'min(10px, 2.2cqmin) min(12px, 2.6cqmin)' }}
    >
      <h3
        className="font-black uppercase tracking-widest text-slate-500"
        style={{ fontSize: 'min(10px, 3cqmin)' }}
      >
        {title}
        {count !== undefined && ` (${count})`}
      </h3>
      {actions}
    </header>
    {children}
  </section>
);
