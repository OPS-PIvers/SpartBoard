// Every Sparty pose at each supported size on light and dark at /sparty-dev (dev builds only).

import React from 'react';
import { Sparty } from '@/components/sparty/Sparty';
import {
  SPARTY_POSES,
  SPARTY_POSE_IDS,
} from '@/components/sparty/spartyFrames';

const SIZES = [32, 64, 96, 128] as const;

const Surface: React.FC<{ dark: boolean }> = ({ dark }) => (
  <div
    className={`grid gap-6 rounded-2xl p-6 ${dark ? 'bg-slate-900 text-slate-300' : 'bg-white text-slate-600'}`}
  >
    {SPARTY_POSE_IDS.map((pose) => (
      <div key={pose} className="flex flex-wrap items-end gap-6">
        <span className="w-16 text-sm font-semibold">{pose}</span>
        {SIZES.map((size) => (
          <Sparty key={size} pose={pose} size={size} label={`Sparty ${pose}`} />
        ))}
        {SPARTY_POSES[pose].frames.map((_, i) => (
          <span key={i} className="text-xs tabular-nums">
            f{i + 1} {SPARTY_POSES[pose].durations[i]}ms
          </span>
        ))}
      </div>
    ))}
  </div>
);

export const SpartyDevGallery: React.FC = () => (
  <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-100 px-6 pt-6 pb-16 font-sans">
    <h1 className="mb-6 text-2xl font-bold text-brand-blue-primary">Sparty</h1>
    <div className="grid gap-6">
      <Surface dark={false} />
      <Surface dark />
    </div>
  </div>
);
