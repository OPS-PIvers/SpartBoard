import React from 'react';
import { Layers } from 'lucide-react';

interface FlashcardsConfigurationPanelProps {
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

/**
 * PR 1 intentionally has no building-level content defaults: sets belong to
 * individual teachers. Registering a real panel still gives administrators a
 * clear configuration surface while rollout is controlled by the permission
 * card's enabled/access-level controls.
 */
export const FlashcardsConfigurationPanel: React.FC<
  FlashcardsConfigurationPanelProps
> = () => (
  <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-rose-100 p-2 text-rose-700">
        <Layers className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
        Teacher-owned libraries
      </h3>
    </div>
  </section>
);
