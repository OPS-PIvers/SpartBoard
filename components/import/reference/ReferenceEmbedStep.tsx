import React, { useEffect, useEffectEvent, useState } from 'react';
import { Loader2, MonitorX } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { tourAttr } from '@/config/tourAnchors';
import { useEmbedConfig } from '@/components/widgets/Embed/hooks/useEmbedConfig';
import { ensureProtocol } from '@/utils/urlHelpers';
import {
  checkReferenceFraming,
  type CompatibilityCheck,
  type FramingVerdict,
} from './framingCheck';
import {
  buildEmbedReference,
  buildLinkReference,
  type ReferenceWidget,
} from './referenceLanding';

interface ReferenceEmbedStepProps {
  url: string;
  title?: string;
  /** Places the widget on the board; called at once when the page can be framed. */
  onPlace: (widget: ReferenceWidget) => void;
  /** Back to the target picker with Embed removed, so the teacher can pick a Conversion. */
  onConvert: () => void;
  onCancel: () => void;
  /** Test seam for the server check. */
  check?: CompatibilityCheck;
}

const hostOf = (url: string) => {
  try {
    return new URL(ensureProtocol(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Embed as Reference material: check framing first and, when refused, offer a Conversion instead of a blank Embed (D6). */
export const ReferenceEmbedStep: React.FC<ReferenceEmbedStepProps> = ({
  url,
  title,
  onPlace,
  onConvert,
  onCancel,
  check,
}) => {
  const { config: embedConfig, isLoading } = useEmbedConfig();
  const [verdict, setVerdict] = useState<FramingVerdict | null>(null);
  // A string key so a fresh array from the permissions listener doesn't re-run the check.
  const allowKey = (embedConfig?.whitelistUrls ?? []).join('\n');

  const place = useEffectEvent((next: FramingVerdict) => {
    setVerdict(next);
    if (next.status !== 'refused') onPlace(buildEmbedReference(url, title));
  });

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    const allowListedHosts = allowKey ? allowKey.split('\n') : [];
    void checkReferenceFraming(url, { allowListedHosts, check }).then(
      (next) => {
        if (!cancelled) place(next);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url, allowKey, check, isLoading]);

  if (verdict?.status !== 'refused') {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"
      >
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Checking whether this page can show on a board
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
      <MonitorX className="w-8 h-8 text-slate-400" aria-hidden="true" />
      <h3 className="text-base font-bold text-slate-800">
        This page can&apos;t show inside SpartBoard
      </h3>
      <p className="max-w-sm text-sm leading-relaxed text-slate-600">
        {hostOf(url)} blocks other sites from showing its pages, so an Embed
        would stay blank.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Button
          variant="primary"
          {...tourAttr('import.reference.convert')}
          onClick={onConvert}
        >
          Convert instead
        </Button>
        <Button
          variant="secondary"
          {...tourAttr('import.reference.add-link')}
          onClick={() => onPlace(buildLinkReference(url, title))}
        >
          Add as a link
        </Button>
        <Button
          variant="ghost"
          {...tourAttr('import.reference.cancel')}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};
