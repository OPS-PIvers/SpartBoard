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
  /** Back to the target picker with Embed removed; left out when there is nothing to convert to. */
  onConvert?: () => void;
  /** False when Links is off for this teacher. */
  canAddLink?: boolean;
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
  canAddLink = true,
  check,
}) => {
  const { config: embedConfig, isLoading } = useEmbedConfig();
  const [checked, setChecked] = useState<{
    url: string;
    verdict: FramingVerdict;
  } | null>(null);
  // A string key so a fresh array from the permissions listener doesn't re-run the check.
  const allowKey = (embedConfig?.whitelistUrls ?? []).join('\n');
  const hideUrlField = embedConfig?.hideUrlField ?? false;
  // The building only allows code embeds, so a page Embed would render empty; otherwise only the current url's verdict counts.
  const verdict: FramingVerdict | null =
    !isLoading && hideUrlField
      ? { status: 'refused', cause: 'policy' }
      : checked?.url === url
        ? checked.verdict
        : null;

  const runCheck = useEffectEvent((allowListedHosts: string[]) =>
    checkReferenceFraming(url, { allowListedHosts, check })
  );
  const place = useEffectEvent((checkedUrl: string, next: FramingVerdict) => {
    // The first verdict for a url wins, so a later allowlist update never places a second Embed.
    if (checked?.url === checkedUrl) return;
    setChecked({ url: checkedUrl, verdict: next });
    if (next.status !== 'refused')
      onPlace(buildEmbedReference(checkedUrl, title));
  });

  useEffect(() => {
    if (isLoading || hideUrlField) return;
    let cancelled = false;
    void runCheck(allowKey ? allowKey.split('\n') : []).then((next) => {
      if (!cancelled) place(url, next);
    });
    return () => {
      cancelled = true;
    };
  }, [url, allowKey, isLoading, hideUrlField]);

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
        {verdict.cause === 'blocked' &&
          `${hostOf(url)} blocks other sites from showing its pages, so an Embed would stay blank.`}
        {verdict.cause === 'insecure' &&
          'This page uses an older, unsecured address, so browsers won’t show it inside SpartBoard.'}
        {verdict.cause === 'invalid' && 'This doesn’t look like a web address.'}
        {verdict.cause === 'policy' &&
          'Your building has turned off showing web pages in an Embed.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        {onConvert && (
          <Button
            variant="primary"
            {...tourAttr('import.reference.convert')}
            onClick={onConvert}
          >
            Convert instead
          </Button>
        )}
        {verdict.cause !== 'invalid' && canAddLink && (
          <Button
            variant={onConvert ? 'secondary' : 'primary'}
            {...tourAttr('import.reference.add-link')}
            onClick={() => onPlace(buildLinkReference(url, title))}
          >
            Add as a link
          </Button>
        )}
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
