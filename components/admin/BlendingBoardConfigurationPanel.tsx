import React from 'react';
import { BlendingBoardGlobalConfig } from '@/types';

interface BlendingBoardConfigurationPanelProps {
  config: BlendingBoardGlobalConfig;
  onChange: (newConfig: BlendingBoardGlobalConfig) => void;
}

export const BlendingBoardConfigurationPanel: React.FC<
  BlendingBoardConfigurationPanelProps
> = ({ config, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="blending-board-url"
          className="text-xxs font-bold text-slate-500 uppercase mb-2 block"
        >
          Embed URL
        </label>
        <input
          id="blending-board-url"
          type="url"
          value={config.url ?? ''}
          onChange={(e) => onChange({ ...config, url: e.target.value.trim() })}
          placeholder="https://research.dwi.ufl.edu/op.n/file/bca9ju45kvvrvoan/?embed"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
        />
        <p className="text-xxs text-slate-400 mt-1">
          Enter the URL of the website to embed in the Blending Board widget.
          Must be served over HTTPS and allow being embedded in an iframe.
        </p>
      </div>
    </div>
  );
};
