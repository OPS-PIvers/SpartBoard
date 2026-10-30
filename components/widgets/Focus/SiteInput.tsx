import React, { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import type { FocusSite } from '@/utils/focus/contract';
import { tourAttr } from '@/config/tourAnchors';
import { explainFocusSite } from './focusWidgetState';
import { FocusButton } from './ui';
import { FIELD_HEIGHT } from './uiSizes';

const QUERY_ID_HINT =
  "That link doesn't name the file. Open the file and copy its address instead.";
const INVALID_HINT = 'Type a web address, like desmos.com.';

/** One line for typing a site, with what it would allow shown under it before the teacher adds it. */
export const SiteInput: React.FC<{
  widgetId: string;
  /** Returning false keeps the typed text, for a server refusal. */
  onAdd: (site: FocusSite) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  /** Full list: adding is refused with this message. */
  fullMessage?: string | null;
  label: string;
  /** Live sessions use their own anchor so a tour can tell the two apart. */
  live?: boolean;
}> = ({ widgetId, onAdd, disabled, fullMessage, label, live }) => {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const parsed = explainFocusSite(text);

  const submit = async () => {
    setTried(true);
    if (parsed.kind !== 'ok' || fullMessage) return;
    if ((await onAdd(parsed.site)) === false) return;
    setText('');
    setTried(false);
  };

  let hint: { text: string; tone: 'info' | 'error' } | null = null;
  if (fullMessage && text) hint = { text: fullMessage, tone: 'error' };
  else if (parsed.kind === 'ok')
    hint = { text: `Allows: ${parsed.covers}`, tone: 'info' };
  else if (parsed.kind === 'query-id')
    hint = { text: QUERY_ID_HINT, tone: 'error' };
  else if (parsed.kind === 'invalid' && (tried || text.length > 3))
    hint = { text: INVALID_HINT, tone: tried ? 'error' : 'info' };

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <form
        className="flex items-stretch"
        style={{ gap: 'min(6px, 1.6cqmin)' }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setTried(false);
          }}
          placeholder="desmos.com or a page's address"
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={hint?.tone === 'error' ? true : undefined}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary disabled:bg-slate-100"
          style={{
            fontSize: 'min(15px, 4.8cqmin)',
            padding: `0 min(10px, 2.6cqmin)`,
            minHeight: FIELD_HEIGHT,
          }}
          {...(live
            ? tourAttr('focus.live-site-input', widgetId)
            : tourAttr('focus.site-input', widgetId))}
        />
        <FocusButton
          type="submit"
          variant="secondary"
          icon={Plus}
          disabled={
            (disabled ?? false) || parsed.kind !== 'ok' || !!fullMessage
          }
          {...(live
            ? tourAttr('focus.live-add-site', widgetId)
            : tourAttr('focus.add-site', widgetId))}
        >
          Add
        </FocusButton>
      </form>
      {hint && (
        <p
          id={hintId}
          role={hint.tone === 'error' ? 'alert' : undefined}
          className={hint.tone === 'error' ? 'text-red-700' : 'text-slate-600'}
          style={{
            fontSize: 'min(15px, 4.6cqmin)',
            marginTop: 'min(4px, 1.2cqmin)',
          }}
        >
          {hint.text}
        </p>
      )}
    </div>
  );
};
