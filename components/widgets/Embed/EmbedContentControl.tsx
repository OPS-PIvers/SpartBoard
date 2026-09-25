import React from 'react';
import { Code, Link2, Loader2 } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { resolveLabel } from '@/components/settings/renderer/resolveLabel';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { useEmbedConfig } from './hooks/useEmbedConfig';
import { EmbedVerifyControl } from './EmbedVerifyControl';
import type { EmbedConfig } from '@/types';

type Props = CustomRenderCtx;

const TEXTAREA_BASE_CLASS =
  'w-full text-xs border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500';
const TEXTAREA_CODE_CLASS =
  'font-mono bg-slate-900 border-slate-700 text-emerald-200 placeholder:text-slate-400';

// schema-gap: buildingGatedContent — hideUrlField (building config) forces code mode for the toggle and the url/html block alike.
const EmbedContentControlImpl: React.FC<Props> = ({
  config,
  widget,
  updateConfig,
  t,
  isAdmin,
  canAccessFeature,
  id,
  labelId,
}) => {
  const buildingId = useWidgetBuildingId(widget);
  const { config: globalConfig, isLoading } = useEmbedConfig(buildingId);
  const label = (leaf: string) => resolveLabel(t, widget.type, leaf);

  if (isLoading) {
    return (
      <div className="flex justify-center p-2">
        <Loader2
          className="w-4 h-4 animate-spin text-slate-400"
          aria-hidden="true"
        />
      </div>
    );
  }

  const hideUrlField = globalConfig?.hideUrlField ?? false;
  const mode = (config.mode as EmbedConfig['mode']) ?? 'url';
  const displayMode = hideUrlField ? 'code' : mode;
  const url = (config.url as EmbedConfig['url']) ?? '';
  const html = (config.html as EmbedConfig['html']) ?? '';

  const urlInputId = `${id}-url`;
  const htmlInputId = `${id}-html`;

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-3"
    >
      {!hideUrlField && (
        <div
          role="radiogroup"
          aria-label={label('modeLabel')}
          className="flex bg-slate-100 p-1 rounded-xl"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'url'}
            onClick={() => updateConfig({ mode: 'url' })}
            className={`flex-1 py-1.5 text-xxs rounded-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'url'
                ? 'bg-white shadow-sm text-indigo-600'
                : 'text-slate-600'
            }`}
          >
            <Link2 className="w-3 h-3" aria-hidden="true" />
            {label('modeUrlOption')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'code'}
            onClick={() => updateConfig({ mode: 'code' })}
            className={`flex-1 py-1.5 text-xxs rounded-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'code'
                ? 'bg-white shadow-sm text-indigo-600'
                : 'text-slate-600'
            }`}
          >
            <Code className="w-3 h-3" aria-hidden="true" />
            {label('modeCodeOption')}
          </button>
        </div>
      )}

      {displayMode === 'url' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={urlInputId}
              className="text-xs font-semibold text-slate-700"
            >
              {label('urlLabel')}
            </label>
            <input
              id={urlInputId}
              type="text"
              value={url}
              placeholder="https://example.com..."
              onChange={(e) => updateConfig({ url: e.target.value })}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <EmbedVerifyControl
            config={config}
            widget={widget}
            updateConfig={updateConfig}
            t={t}
            isAdmin={isAdmin}
            canAccessFeature={canAccessFeature}
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={htmlInputId}
            className="text-xs font-semibold text-slate-700"
          >
            {label('htmlLabel')}
          </label>
          <textarea
            id={htmlInputId}
            value={html}
            placeholder={
              '<html>\n  <style>body { background: #f0f; }</style>\n  <body><h1>Hello Class!</h1></body>\n</html>'
            }
            rows={8}
            spellCheck={false}
            onChange={(e) => updateConfig({ html: e.target.value })}
            className={`${TEXTAREA_BASE_CLASS} ${TEXTAREA_CODE_CLASS}`}
          />
        </div>
      )}
    </div>
  );
};

export const EmbedContentControl = React.memo(EmbedContentControlImpl);
EmbedContentControl.displayName = 'EmbedContentControl';
