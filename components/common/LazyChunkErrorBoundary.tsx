import React from 'react';
import { RotateCw } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { attemptChunkReload, isChunkLoadError } from '@/utils/chunkLoadError';
import { LazyChunkFailedTile } from './LazyChunkFailedTile';

interface LazyChunkErrorBoundaryProps {
  children: React.ReactNode;
}

interface LazyChunkErrorBoundaryState {
  error: Error | null;
  reloadInFlight: boolean;
}

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
          iconClassName="text-slate-400 animate-spin"
        />
      );
    }

    return <LazyChunkFailedTile onRetry={this.handleRetry} />;
  }
}
