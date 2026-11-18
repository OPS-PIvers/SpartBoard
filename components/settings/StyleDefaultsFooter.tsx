import React from 'react';
import { tourAttr } from '@/config/tourAnchors';
import type { TranslateFn } from './schema/types';
import type { StyleDefaultsState } from './styleDefaults';

export type StyleDefaultsFooterProps = {
  state: Pick<StyleDefaultsState, 'keys' | 'differs'> & { tooLarge?: boolean };
  onSave: () => void;
  onReset: () => void;
  t: TranslateFn;
  widget: { id: string; type: string };
  /** The Settings tab reuses this footer with its own anchors. */
  tab?: 'style' | 'settings';
};

const buttonClass =
  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed';

// Explicit "my default" controls at the foot of the Style tab (D28) and the Settings tab.
export const StyleDefaultsFooter: React.FC<StyleDefaultsFooterProps> = ({
  state,
  onSave,
  onReset,
  t,
  widget,
  tab = 'style',
}) => {
  if (state.keys.length === 0) return null;
  const saveAnchor =
    tab === 'style'
      ? tourAttr('settings.style-defaults-save', widget.id, widget.type)
      : tourAttr('settings.settings-defaults-save', widget.id, widget.type);
  const resetAnchor =
    tab === 'style'
      ? tourAttr('settings.style-defaults-reset', widget.id, widget.type)
      : tourAttr('settings.settings-defaults-reset', widget.id, widget.type);
  return (
    <section
      data-testid={`${tab}-defaults-footer`}
      className="flex flex-col gap-2 border-t border-slate-200 pt-4"
    >
      <p role="status" className="text-xs text-slate-700">
        {state.differs
          ? t('widgetSettings.common.defaults.differs')
          : t('widgetSettings.common.defaults.matches')}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          {...saveAnchor}
          disabled={!state.differs || state.tooLarge}
          className={`${buttonClass} bg-brand-blue-primary text-white hover:bg-brand-blue-dark`}
        >
          {t('widgetSettings.common.defaults.save')}
        </button>
        <button
          type="button"
          onClick={onReset}
          {...resetAnchor}
          disabled={!state.differs}
          className={`${buttonClass} bg-slate-100 text-slate-800 hover:bg-slate-200`}
        >
          {t('widgetSettings.common.defaults.reset')}
        </button>
      </div>
    </section>
  );
};
