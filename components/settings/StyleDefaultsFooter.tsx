import React from 'react';
import type { TranslateFn } from './schema/types';
import type { StyleDefaultsState } from './styleDefaults';

export type StyleDefaultsFooterProps = {
  state: StyleDefaultsState;
  onSave: () => void;
  onReset: () => void;
  t: TranslateFn;
};

const buttonClass =
  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed';

// Explicit "my default" controls at the foot of the Style tab (D28).
export const StyleDefaultsFooter: React.FC<StyleDefaultsFooterProps> = ({
  state,
  onSave,
  onReset,
  t,
}) => {
  if (state.keys.length === 0) return null;
  return (
    <section
      data-testid="style-defaults-footer"
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
          disabled={!state.differs}
          className={`${buttonClass} bg-brand-blue-primary text-white hover:bg-brand-blue-dark`}
        >
          {t('widgetSettings.common.defaults.save')}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!state.differs}
          className={`${buttonClass} bg-slate-100 text-slate-800 hover:bg-slate-200`}
        >
          {t('widgetSettings.common.defaults.reset')}
        </button>
      </div>
    </section>
  );
};
