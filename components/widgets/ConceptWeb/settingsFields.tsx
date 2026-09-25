import React from 'react';
import { Button } from '@/components/common/Button';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ConceptWebConfig } from '@/types';

export const ConceptWebCanvasField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as unknown as ConceptWebConfig;
  const width =
    typeof config.defaultNodeWidth === 'number' ? config.defaultNodeWidth : 15;
  const height =
    typeof config.defaultNodeHeight === 'number'
      ? config.defaultNodeHeight
      : 15;
  const nodes = config.nodes ?? [];
  const edges = config.edges ?? [];
  const hasContent = nodes.length > 0 || edges.length > 0;
  const t = (leaf: string) => ctx.t(`widgetSettings.concept-web.${leaf}`);

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      <div className="relative flex min-h-32 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div
          className="absolute flex flex-col items-center justify-center rounded-lg border border-slate-300 bg-amber-100 p-2 shadow-sm"
          style={{
            width: `${width}%`,
            height: `${height}%`,
            containerType: 'size',
          }}
        >
          <textarea
            aria-label={t('previewLabel')}
            readOnly
            value={t('previewText')}
            className="h-full w-full resize-none rounded-sm border-none bg-transparent text-center text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            style={{ fontSize: '15cqmin' }}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="danger"
        disabled={!hasContent}
        onClick={() => ctx.updateConfig({ nodes: [], edges: [] })}
        className="w-full"
      >
        {t('clearAll')}
      </Button>
    </div>
  );
};
