import React, { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
} from 'lucide-react';
import { functions } from '@/config/firebase';
import type {
  FieldCtx,
  UpdateConfig,
} from '@/components/settings/schema/types';
import { resolveLabel } from '@/components/settings/renderer/resolveLabel';
import { ensureProtocol } from '@/utils/urlHelpers';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { useEmbedConfig } from './hooks/useEmbedConfig';
import { TRUSTED_EMBED_HOSTNAMES } from './trustedHostnames';
import type { EmbedConfig } from '@/types';

interface CompatibilityResult {
  isEmbeddable: boolean;
  reason?: string;
  error?: string;
  uncertain?: boolean;
}

type Props = FieldCtx & { updateConfig: UpdateConfig };

// schema-gap: asyncVerify — Cloud Function check writing isEmbeddable + blockedReason together; url edits reset isEmbeddable.
const EmbedVerifyControlImpl: React.FC<Props> = ({
  config,
  widget,
  updateConfig,
  t,
}) => {
  const url = (config.url as EmbedConfig['url']) ?? '';
  const isEmbeddable =
    (config.isEmbeddable as EmbedConfig['isEmbeddable']) ?? true;
  const buildingId = useWidgetBuildingId(widget);
  const { config: globalConfig, isLoading } = useEmbedConfig(buildingId);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<
    'idle' | 'success' | 'blocked' | 'error'
  >('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const label = (leaf: string) => resolveLabel(t, widget.type, leaf);

  const allowListedDomains = useMemo(
    () =>
      new Set([
        'www.carriderpro.com',
        'carriderpro.com',
        ...TRUSTED_EMBED_HOSTNAMES,
        ...(globalConfig?.whitelistUrls ?? []).map((d) => d.toLowerCase()),
      ]),
    [globalConfig?.whitelistUrls]
  );

  // Reset the stale verify result whenever the teacher edits the URL, matching the legacy input's per-keystroke reset.
  const prevUrlRef = useRef(url);
  useEffect(() => {
    if (prevUrlRef.current === url) return;
    prevUrlRef.current = url;
    setVerifyStatus('idle');
    updateConfig({ isEmbeddable: true });
  }, [url, updateConfig]);

  // Tracks the latest url synchronously so an in-flight verify can tell it went stale; assigned in the render body per repo convention, not an effect.
  const currentUrlRef = useRef(url);
  currentUrlRef.current = url;

  const isActuallyEmbeddable = useMemo(() => {
    if (isEmbeddable) return true;
    try {
      const parsed = new URL(ensureProtocol(url));
      return allowListedDomains.has(parsed.hostname.toLowerCase());
    } catch (_e) {
      return isEmbeddable;
    }
  }, [isEmbeddable, url, allowListedDomains]);

  const handleVerify = async () => {
    if (!url) return;
    const verifiedUrl = url;
    setIsVerifying(true);
    setVerifyStatus('idle');

    try {
      const parsed = new URL(ensureProtocol(url));
      if (allowListedDomains.has(parsed.hostname.toLowerCase())) {
        setVerifyStatus('success');
        updateConfig({ isEmbeddable: true, blockedReason: '' });
        setIsVerifying(false);
        return;
      }
    } catch (_e) {
      // Fall through to network verification if URL parsing fails.
    }

    try {
      const checkCompatibility = httpsCallable<
        { url: string },
        CompatibilityResult
      >(functions, 'checkUrlCompatibility');
      const result = await checkCompatibility({ url: verifiedUrl });
      // The teacher edited the url while this was in flight; discard the stale result.
      if (currentUrlRef.current !== verifiedUrl) return;
      const data = result.data;

      if (data.uncertain) {
        // The probe never reached the site, so leave the saved verdict alone rather than claiming either answer.
        setVerifyStatus('error');
        setErrorMsg(label('verifyErrorGeneric'));
      } else if (data.isEmbeddable) {
        setVerifyStatus('success');
        updateConfig({ isEmbeddable: true, blockedReason: '' });
      } else {
        setVerifyStatus('blocked');
        setErrorMsg(data.reason ?? label('verifyBlockedFallback'));
        updateConfig({ isEmbeddable: false, blockedReason: data.reason ?? '' });
      }
    } catch (err) {
      if (currentUrlRef.current !== verifiedUrl) return;
      console.error('Verify error:', err);
      setVerifyStatus('error');
      setErrorMsg(label('verifyErrorGeneric'));
    } finally {
      setIsVerifying(false);
    }
  };

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

  const sanitizedUrl = ensureProtocol(url);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleVerify}
          disabled={!url || isVerifying}
          className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xxs font-bold hover:bg-slate-800 disabled:bg-slate-200 transition-all flex items-center gap-2 shrink-0"
        >
          {isVerifying ? (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          ) : (
            label('verifyButton')
          )}
        </button>
        {url && (
          <a
            href={sanitizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 text-xxs text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors"
          >
            {label('openOriginal')}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        )}
      </div>

      {verifyStatus === 'success' && (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
          <span className="text-xxs font-medium">{label('verifySuccess')}</span>
        </div>
      )}
      {verifyStatus === 'blocked' && (
        <div className="flex items-start gap-2 text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
          <XCircle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xxs font-bold">
              {label('verifyBlockedTitle')}
            </span>
            <span className="text-xxs leading-tight opacity-80">
              {errorMsg} {label('verifyBlockedFallbackNote')}
            </span>
          </div>
        </div>
      )}
      {verifyStatus === 'error' && (
        <div className="flex items-center gap-2 text-red-500">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          <span className="text-xxs font-medium">{errorMsg}</span>
        </div>
      )}

      {!isActuallyEmbeddable && verifyStatus === 'idle' && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
          <AlertCircle
            className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-xxs text-amber-800 leading-relaxed">
            {label('flaggedNotice')}
          </p>
        </div>
      )}

      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
        <AlertCircle
          className="w-4 h-4 text-slate-400 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="text-xxs text-slate-500 leading-relaxed">
          {label('verifyTip')}
        </p>
      </div>
    </div>
  );
};

export const EmbedVerifyControl = React.memo(EmbedVerifyControlImpl);
EmbedVerifyControl.displayName = 'EmbedVerifyControl';
