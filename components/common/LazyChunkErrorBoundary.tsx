import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { attemptChunkReload, isChunkLoadError } from '@/utils/chunkLoadError';

interface LazyChunkErrorBoundaryProps {
  children: React.ReactNode;
}

interface LazyChunkErrorBoundaryState {
  error: Error | null;
  reloadInFlight: boolean;
}

const RETRY_BUTTON_CLASS =
  'rounded-md bg-slate-700/80 font-medium text-white transition hover:bg-slate-600';
const RETRY_BUTTON_STYLE: React.CSSProperties = {
  fontSize: 'min(12px, 4cqmin)',
  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
};

/**
 * Catches errors thrown by a Suspended descendant — most importantly, the
 * dynamic-import failures that occur when a widget chunk no longer exists
 * after a redeploy. A stale-chunk error triggers a one-shot full-page reload
 * (guarded by sessionStorage so we never loop); when the guard suppresses the
 * reload (or the error is unrelated), the boundary renders a scoped retry
 * tile so a single bad widget can't blank the entire dashboard.
 */
export class LazyChunkErrorBoundary extends React.Component<
  LazyChunkErrorBoundaryProps,
  LazyChunkErrorBoundaryState
> {
  override state: LazyChunkErrorBoundaryState = {
    error: null,
    reloadInFlight: false,
  };

  static getDerivedStateFromError(
    error: Error
  ): Partial<LazyChunkErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      const reloaded = attemptChunkReload();
      if (reloaded) {
        console.warn(
          '[LazyChunkErrorBoundary] Chunk load failed — reloading',
          error.message
        );
        this.setState({ reloadInFlight: true });
      } else {
        console.warn(
          '[LazyChunkErrorBoundary] Chunk load failed and reload already attempted this session — showing retry UI',
          error.message
        );
      }
      return;
    }
    console.error(
      '[LazyChunkErrorBoundary] Widget render error',
      error,
      info.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ error: null, reloadInFlight: false });
  };

  override render() {
    const { error, reloadInFlight } = this.state;
    if (!error) return this.props.children;

    if (reloadInFlight) {
      return (
        <ScaledEmptyState
          icon={RotateCw}
          title="Updating…"
          subtitle="Loading the latest version."
          iconClassName="text-slate-400 animate-spin"
        />
      );
    }

    return (
      <ScaledEmptyState
        icon={AlertTriangle}
        title="Widget failed to load"
        subtitle="Refresh the page to try again."
        iconClassName="text-amber-400"
        action={
          <button
            type="button"
            onClick={this.handleRetry}
            className={RETRY_BUTTON_CLASS}
            style={RETRY_BUTTON_STYLE}
          >
            Retry
          </button>
        }
      />
    );
  }
}
