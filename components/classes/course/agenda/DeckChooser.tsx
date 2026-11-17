// Two ways to set the Agenda deck: select it in Google Drive, or paste its Slides link.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';

interface DeckChooserProps {
  busy: boolean;
  onPick: () => Promise<void>;
  /** Resolves true once the pasted deck is saved. */
  onPaste: (text: string) => Promise<boolean>;
}

export const DeckChooser: React.FC<DeckChooserProps> = ({
  busy,
  onPick,
  onPaste,
}) => {
  const { t } = useTranslation();
  const [link, setLink] = useState('');
  const label = t('course.agenda.pasteLabel', {
    defaultValue: 'Or paste a Google Slides link',
  });

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onPick()}
        {...tourAttr('classes.agenda-pick')}
        className={`${primaryBtn} w-full disabled:opacity-50`}
      >
        {t('course.agenda.pick', {
          defaultValue: 'Select from Google Drive',
        })}
      </button>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onPaste(link).then((ok) => {
            if (ok) setLink('');
          });
        }}
      >
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!text || busy) return;
            e.preventDefault();
            setLink(text);
            void onPaste(text).then((ok) => {
              if (ok) setLink('');
            });
          }}
          type="text"
          inputMode="url"
          placeholder={label}
          aria-label={label}
          {...tourAttr('classes.agenda-paste')}
          className={`${inputLight} min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm`}
        />
        <button
          type="submit"
          disabled={busy || !link.trim()}
          {...tourAttr('classes.agenda-paste-use')}
          className={`${secondaryBtn} shrink-0 disabled:opacity-50`}
        >
          {t('course.agenda.pasteUse', { defaultValue: 'Use link' })}
        </button>
      </form>
    </div>
  );
};
